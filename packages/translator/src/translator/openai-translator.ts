import type {
  Logger,
  PromptBuilder,
  SegmentContext,
  Translator,
} from '@/types';
import { detectChinese, getPreviousSource } from '@/utils';
import {
  isPassthroughLine,
  validateTranslationLines,
} from '@/translation-lines';

import {
  createPiAiCompletion,
  PiAiRequestError,
  type PiAiProtocol,
} from './pi-ai-api';
import { createOpenAiPromptBuilder } from './openai-prompt';

import {
  buildOpenAiProfileParams,
  openAiProfiles,
  type openAiProfileId,
} from './profiles/openai';
import { DEFAULT_FIELD_VALUE, type ProfileValues } from './profiles/types';

export type OpenAiTranslatorConfig = {
  endpoint: string;
  key: string;
  model: string;
  profile?: {
    id: openAiProfileId;
    values?: ProfileValues;
  };
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
  private log: Logger;

  constructor(config: OpenAiTranslatorConfig) {
    this.endpoint = config.endpoint;
    this.key = config.key;
    const apiFormat =
      openAiProfiles.find((p) => p.id === config.profile?.id)?.apiFormat ??
      'openai';
    this.protocol = apiFormat === 'openai' ? 'openai-completions' : apiFormat;
    this.model = config.model;
    this.profileParams = buildOpenAiProfileParams(
      config.profile?.id,
      config.profile?.values,
    );
    const effort = config.profile?.values?.reasoning_effort;
    this.reasoningEffort =
      !effort || effort === DEFAULT_FIELD_VALUE ? '默认' : String(effort);
    this.promptBuilder = config.promptBuilder ?? createOpenAiPromptBuilder();
    this.log = config.log ?? (() => {});
  }

  async translate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (lines.length === 0) return [];
    if (lines.every(isPassthroughLine)) {
      return lines;
    }
    this.log(`请求思考强度：${this.reasoningEffort}`);
    const logSegInfo = (retry: number, lineNumber: [number, number]) => {
      const parts: string[] = [];
      const [input, output] = lineNumber;
      parts.push(`第${retry + 1}次`);
      parts.push(`原文/输出：${input}/${output}行`);
      this.log(parts.join('　'));
    };

    let retry = 0;
    let failBecauseLineNumberNotMatch = 0;

    while (retry < 3) {
      let result: string[];
      try {
        result = await this.translateLines(lines, context, signal);
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        this.log(`翻译错误：${err}`);
        if (err instanceof PiAiRequestError) throw err;
        retry++;
        continue;
      }

      logSegInfo(retry, [lines.length, result.length]);
      // 单独统计行数错误，用于决定是否启动二分翻译。
      if (lines.length !== result.length) {
        failBecauseLineNumberNotMatch++;
        this.log('输出错误：输出行数不匹配');
        retry++;
        continue;
      }

      try {
        validateTranslationLines(lines, result);
      } catch (err) {
        this.log(`输出错误：${err}`);
        retry++;
        continue;
      }

      const joined = result
        .filter((_, i) => !isPassthroughLine(lines[i]))
        .join(' ');
      if (!detectChinese(joined)) {
        this.log('输出错误：输出语言不是中文');
        retry++;
        continue;
      }
      return result;
    }

    // 仅当连续3次行数不匹配且行数大于1时，启动二分翻译
    if (failBecauseLineNumberNotMatch === 3 && lines.length > 1) {
      return this.binaryTranslate(lines, context, signal);
    }
    throw new Error('翻译失败：重试次数过多');
  }

  private async translateLines(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (lines.length === 0) return [];
    if (lines.every(isPassthroughLine)) {
      return lines;
    }

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
    lines: string[],
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
        if (result.length !== 1) return [lines[left]];
        validateTranslationLines([lines[left]], result);
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
