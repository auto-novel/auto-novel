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
import { createOpenAiPromptBuilder } from './llm-prompt';
import { createTranslationCacheKey } from '@/cache';

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

export class OpenAiTranslator implements Translator {
  private endpoint: string;
  private key: string;
  private protocol: PiAiProtocol;
  private model: string;
  private profileParams: Record<string, unknown>;
  private reasoningEffort: string;
  private promptBuilder: PromptBuilder;
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
  }

  getCacheKey({ lines, context }: Pick<TranslateRequest, 'lines' | 'context'>) {
    return createTranslationCacheKey(
      this.model,
      lines,
      this.promptBuilder,
      true,
      context,
    );
  }

  async translate({
    lines,
    context,
    signal,
    attempt,
  }: TranslateRequest): Promise<string[]> {
    if (lines.length === 0) return [];
    if (attempt === 0) this.log(`请求思考强度：${this.reasoningEffort}`);

    const result = await this.translateLines(lines, context, signal);
    if (!detectChinese(result.join(' '))) {
      throw new TranslationRejected('language', '输出语言不是中文');
    }
    return result;
  }

  /** 输出形状反复失败时串行逐行翻译，避免降级请求突破外层并发限制。 */
  async fallback({
    lines,
    context,
    signal,
  }: TranslateRequest): Promise<string[]> {
    const sourceLines = context?.previousSource
      ? [context.previousSource, ...lines]
      : lines;
    const sourceOffset = sourceLines.length - lines.length;
    const translatedLines: string[] = [];
    for (let index = 0; index < lines.length; index++) {
      signal?.throwIfAborted();
      this.log(`逐行翻译第${index + 1}/${lines.length}行`);
      const result = await this.translateLines(
        [lines[index]],
        {
          ...context,
          previousSource: getPreviousSource(sourceLines, sourceOffset + index),
        },
        signal,
      );
      signal?.throwIfAborted();
      translatedLines.push(
        result.length === 1 && !/[\r\n]/.test(result[0])
          ? result[0]
          : lines[index],
      );
    }
    return translatedLines;
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
