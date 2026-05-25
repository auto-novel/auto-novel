import type {
  Logger,
  PromptBuilder,
  SegmentContext,
  Translator,
} from '@/types';
import { detectChinese } from '@/utils';

import { createOpenAiApi } from './openai-api';
import { createOpenAiPromptBuilder } from './openai-prompt';

export type OpenAiTranslatorConfig = {
  endpoint: string;
  key: string;
  model: string;
  promptBuilder?: PromptBuilder;
  log?: Logger;
};

export class OpenAiTranslator implements Translator {
  private api: ReturnType<typeof createOpenAiApi>;
  private model: string;
  private promptBuilder: PromptBuilder;
  private log: Logger;

  constructor(config: OpenAiTranslatorConfig) {
    this.api = createOpenAiApi(config.endpoint, config.key);
    this.model = config.model;
    this.promptBuilder = config.promptBuilder ?? createOpenAiPromptBuilder();
    this.log = config.log ?? (() => {});
  }

  async translate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (lines.length === 0) return [];
    if (lines.every((l) => l.trim().length === 0)) {
      return lines;
    }
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
        retry++;
        continue;
      }

      logSegInfo(retry, [lines.length, result.length]);
      if (lines.length !== result.length) {
        failBecauseLineNumberNotMatch++;
        this.log('输出错误：输出行数不匹配');
        retry++;
        continue;
      }

      const joined = result.join(' ');
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
    if (lines.every((l) => l.trim().length === 0)) {
      return lines;
    }

    const messages = this.promptBuilder.build(lines, context);
    const completion = await this.api.createChatCompletions(
      {
        model: this.model,
        messages,
      },
      { signal },
    );

    const content = completion.choices[0]?.message?.content ?? '';
    return this.promptBuilder.parseAnswer(content, lines);
  }

  private async binaryTranslate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const binary = async (left: number, right: number): Promise<string[]> => {
      signal?.throwIfAborted();

      if (left >= right) return [];
      if (right - left === 1) {
        const result = await this.translateLines(
          [lines[left]],
          context,
          signal,
        );
        return result.length === 1 ? result : [lines[left]];
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
