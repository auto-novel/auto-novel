import type {
  Logger,
  PromptBuilder,
  SegmentContext,
  TranslateRequest,
  Translator,
} from '@/types';
import { detectChinese, getPreviousSource, isAbortError } from '@/utils';

import { createPiAiCompletion, type PiAiProtocol } from './llm-client';
import { TranslationRejected } from '@/errors';
import { createOpenAiPromptBuilder, PartialGptAnswer } from './llm-prompt';
import { createTranslationCacheKey } from '@/cache';
import { isGptPassthroughLine, prepareGptText } from './llm-text';

import {
  resolveOpenAiProfile,
  type OpenAiProfileSelection,
} from './llm-profiles';

export type OpenAiTranslatorConfig = {
  endpoint: string;
  key: string;
  model: string;
  /** 持久化数据未经类型校验，构造时统一校验一次。 */
  profile?: OpenAiProfileSelection;
  promptBuilder?: PromptBuilder;
  log?: Logger;
};

type PartialTranslation = {
  context?: SegmentContext;
  signal?: AbortSignal;
  translated: Array<string | undefined>;
  nextAttempt: number;
  busy: boolean;
};

export class OpenAiTranslator implements Translator {
  readonly trusted = true;
  private endpoint: string;
  private key: string;
  private protocol: PiAiProtocol;
  private model: string;
  private profileParams: Record<string, unknown>;
  private reasoningEffort: string;
  private promptBuilder: PromptBuilder;
  // 只在同一分段的外层重试之间复用，不进入持久缓存。
  private partials = new WeakMap<readonly string[], PartialTranslation>();
  private overlapping = new WeakSet<readonly string[]>();
  readonly log: Logger;

  constructor(config: OpenAiTranslatorConfig) {
    this.endpoint = config.endpoint;
    this.key = config.key;
    const profile = resolveOpenAiProfile(config.profile);
    this.protocol = profile.protocol;
    this.model = config.model;
    this.profileParams = profile.requestParams;
    this.reasoningEffort = profile.reasoningEffort;
    this.promptBuilder = config.promptBuilder ?? createOpenAiPromptBuilder();
    this.log = config.log ?? (() => {});
    this.log(`请求思考强度：${this.reasoningEffort}`);
  }

  getCacheKey({ lines, context }: Pick<TranslateRequest, 'lines' | 'context'>) {
    const key = createTranslationCacheKey(
      this.model,
      lines,
      this.promptBuilder,
      this.trusted,
      context,
    );
    // GPT 的保护/还原规则变化，不能复用旧版未经这些检查的缓存。
    return key === undefined ? undefined : `gpt-text:v2:${key}`;
  }

  async translate(request: TranslateRequest): Promise<string[]> {
    const { lines, signal, attempt } = request;
    signal?.throwIfAborted();
    const state = this.getPartial(request);
    try {
      const pending = this.pendingIndexes(state);
      if (pending.length) await this.translateRows(request, state, pending);
      this.clearPartial(lines, state);
      return state.translated as string[];
    } catch (error) {
      if (error instanceof TranslationRejected && !signal?.aborted) {
        state.nextAttempt = attempt + 1;
      } else {
        this.clearPartial(lines, state);
      }
      throw error;
    } finally {
      state.busy = false;
    }
  }

  /** 输出形状反复失败时串行逐行翻译，避免降级请求突破外层并发限制。 */
  async fallback(request: TranslateRequest): Promise<string[]> {
    request.signal?.throwIfAborted();
    const state = this.getPartial(request, true);
    try {
      for (const index of this.pendingIndexes(state)) {
        request.signal?.throwIfAborted();
        this.log(`逐行翻译第${index + 1}/${request.lines.length}行`);
        await this.translateRows(request, state, [index]);
      }
      return state.translated as string[];
    } finally {
      this.clearPartial(request.lines, state);
      state.busy = false;
    }
  }

  private getPartial(request: TranslateRequest, fallback = false) {
    const { lines, context, signal, attempt } = request;
    const previous = this.partials.get(lines);
    // 同一个数组被并行借用时无法区分重试链，禁用复用以免串入其他任务。
    if (previous?.busy) {
      this.overlapping.add(lines);
      this.partials.delete(lines);
    }
    const reusable =
      !this.overlapping.has(lines) &&
      previous &&
      previous.context === context &&
      previous.signal === signal &&
      (fallback || (attempt > 0 && previous.nextAttempt === attempt));
    const state: PartialTranslation = reusable
      ? previous
      : {
          context,
          signal,
          translated: lines.map((line) =>
            isGptPassthroughLine(line, context?.glossary) ? line : undefined,
          ),
          nextAttempt: attempt,
          busy: false,
        };
    state.busy = true;
    if (!this.overlapping.has(lines)) this.partials.set(lines, state);
    return state;
  }

  private clearPartial(lines: readonly string[], state: PartialTranslation) {
    if (this.partials.get(lines) === state) this.partials.delete(lines);
  }

  private pendingIndexes(state: PartialTranslation) {
    return state.translated.flatMap((line, index) =>
      line === undefined ? [index] : [],
    );
  }

  /** 每次尝试只请求尚未通过的行；次数和降级时机仍由流水线决定。 */
  private async translateRows(
    { lines, context, signal }: TranslateRequest,
    state: PartialTranslation,
    indexes: readonly number[],
  ): Promise<void> {
    signal?.throwIfAborted();
    const subset = indexes.map((index) => lines[index]);
    const sourceLines = context?.previousSource
      ? [context.previousSource, ...lines]
      : lines;
    const text = prepareGptText(
      subset,
      indexes.length === lines.length
        ? context
        : {
            ...context,
            previousSource: getPreviousSource(
              sourceLines,
              sourceLines.length - lines.length + indexes[0],
            ),
            history: undefined,
            expired: true,
          },
    );
    let result: readonly (string | undefined)[];
    let failure: TranslationRejected | undefined;
    try {
      result = await this.translateLines(text.lines, text.context, signal);
    } catch (error) {
      if (
        !(error instanceof TranslationRejected) ||
        !(error.cause instanceof PartialGptAnswer)
      )
        throw error;
      result = error.cause.lines;
      failure = error;
    }
    signal?.throwIfAborted();
    // 自定义解析器若未提供逐行编号，长度不符时不能猜测行的对应关系。
    if (result.length !== indexes.length)
      throw new TranslationRejected('lines', '翻译结果行数不匹配');
    for (const [offset, index] of indexes.entries()) {
      const line = result[offset];
      if (line === undefined) {
        if (!failure)
          failure = new TranslationRejected('lines', '翻译结果缺少行');
        continue;
      }
      try {
        const restored = text.restoreLine(offset, line);
        const natural = text.languageText(offset, line);
        if (!natural.trim() || !detectChinese(natural)) {
          if (!failure)
            failure = new TranslationRejected('language', '输出语言不是中文');
          continue;
        }
        state.translated[index] = restored;
      } catch (error) {
        failure = new TranslationRejected(
          'lines',
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    }
    if (failure) throw failure;
  }

  private async translateLines(
    lines: readonly string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const messages = this.promptBuilder.build(lines, context);
    const completion = await createPiAiCompletion({
      protocol: this.protocol,
      endpoint: this.endpoint,
      key: this.key,
      model: this.model,
      messages,
      requestParams: this.profileParams,
      signal,
    });
    if (completion.reasoning) {
      this.log(`思考：${completion.reasoning}`);
    }

    try {
      return this.promptBuilder.parseAnswer(completion.text, lines);
    } catch (error) {
      signal?.throwIfAborted();
      if (isAbortError(error)) throw error;
      throw new TranslationRejected(
        'lines',
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }
}
