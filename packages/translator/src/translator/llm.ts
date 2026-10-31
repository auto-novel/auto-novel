import type {
  Logger,
  PromptBuilder,
  SegmentContext,
  TranslateRequest,
  Translator,
} from '@/types';
import { detectChinese, getPreviousSource, isAbortError } from '@/utils';

import {
  createPiAiCompletion,
  PiAiRequestError,
  type PiAiProtocol,
} from './llm-client';
import { TranslationRejected } from '@/errors';
import { createOpenAiPromptBuilder } from './llm-prompt';

import {
  buildOpenAiProfileParams,
  openAiProfiles,
  parseOpenAiProfileSelection,
  DEFAULT_FIELD_VALUE,
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
    const profile =
      config.profile === undefined
        ? undefined
        : parseOpenAiProfileSelection(config.profile);
    const apiFormat =
      openAiProfiles.find((p) => p.id === profile?.id)?.apiFormat ?? 'openai';
    this.protocol = apiFormat === 'openai' ? 'openai-completions' : apiFormat;
    this.model = config.model;
    this.profileParams = buildOpenAiProfileParams(profile?.id, profile?.values);
    const effort = profile?.values?.reasoning_effort;
    this.reasoningEffort =
      !effort || effort === DEFAULT_FIELD_VALUE ? '默认' : String(effort);
    this.promptBuilder = config.promptBuilder ?? createOpenAiPromptBuilder();
    this.log = config.log ?? (() => {});
  }

  async translate({
    lines,
    context,
    signal,
    attempt,
  }: TranslateRequest): Promise<string[]> {
    if (lines.length === 0) return [];
    if (attempt === 0) this.log(`请求思考强度：${this.reasoningEffort}`);

    let result: string[];
    try {
      result = await this.translateLines(lines, context, signal);
    } catch (error) {
      // 取消与服务商参数错误不重试。
      if (error instanceof PiAiRequestError || isAbortError(error)) throw error;
      this.log(`翻译错误：${error}`);
      throw new TranslationRejected('request', String(error), error);
    }
    if (!detectChinese(result.join(' '))) {
      throw new TranslationRejected('language', '输出语言不是中文');
    }
    return result;
  }

  /** 行数始终对不齐时二分翻译，只为修复输出形状。 */
  async fallback({
    lines,
    context,
    signal,
  }: TranslateRequest): Promise<string[]> {
    return this.binaryTranslate(lines, context, signal);
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

    return this.promptBuilder.parseAnswer(completion.text, lines);
  }

  private async binaryTranslate(
    lines: readonly string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const sourceLines = context?.previousSource
      ? [context.previousSource, ...lines]
      : lines;
    const sourceOffset = sourceLines.length - lines.length;
    const binary = async (left: number, right: number): Promise<string[]> => {
      signal?.throwIfAborted();

      if (left >= right) return [];
      if (right - left === 1) {
        const result = await this.translateLines(
          [lines[left]],
          {
            ...context,
            previousSource: getPreviousSource(sourceLines, sourceOffset + left),
          },
          signal,
        );
        if (result.length !== 1 || /[\r\n]/.test(result[0])) {
          return [lines[left]];
        }
        return result;
      }

      const mid = Math.floor((left + right) / 2);
      const [partLeft, partRight] = await Promise.all([
        binary(left, mid),
        binary(mid, right),
      ]);
      this.log(`翻译${left + 1}到${right}行`);

      // 校验子结果行数是否匹配，不匹配则继续递归
      const expectedLeftLen = mid - left;
      const expectedRightLen = right - mid;
      const fixedLeft =
        partLeft.length === expectedLeftLen
          ? partLeft
          : await binary(left, mid);
      const fixedRight =
        partRight.length === expectedRightLen
          ? partRight
          : await binary(mid, right);

      if (
        fixedLeft.length !== expectedLeftLen ||
        fixedRight.length !== expectedRightLen
      ) {
        this.log('失败，继续二分');
      }
      return fixedLeft.concat(fixedRight);
    };

    return binary(0, lines.length);
  }
}
