import type { SegmentContext, Translator, PromptBuilder } from '@/types';
import { createOpenAiApi } from '@/api/OpenAiApi';
import { detectChinese } from '@/utils';
import { createOpenAiPromptBuilder } from './prompt_openai';

export type OpenAiTranslatorConfig = {
  type: 'openai';
  endpoint: string;
  key: string;
  model: string;
  //如果不指定，则由翻译器创建默认翻译Prompt
  promptBuilder?: PromptBuilder;
};

export class OpenAiTranslator implements Translator {
  private api: ReturnType<typeof createOpenAiApi>;
  private model: string;
  private promptBuilder: NonNullable<OpenAiTranslatorConfig['promptBuilder']>;

  constructor(config: OpenAiTranslatorConfig) {
    this.api = createOpenAiApi(config.endpoint, config.key);
    this.model = config.model;
    this.promptBuilder = config.promptBuilder ?? createOpenAiPromptBuilder();
  }

  async translate(
    lines: string[],
    context?: SegmentContext,
  ): Promise<string[]> {
    if (lines.length === 0) return [];

    let retry = 0;
    let failBecauseLineNumberNotMatch = 0;

    while (retry < 3) {
      const result = await this.translateLines(lines, context);

      if (lines.length !== result.length) {
        failBecauseLineNumberNotMatch++;
        retry++;
        continue;
      }

      const joined = result.join(' ');
      if (!detectChinese(joined)) {
        retry++;
        continue;
      }
      return result;
    }

    // 仅当连续3次行数不匹配且行数大于1时，启动二分翻译
    if (failBecauseLineNumberNotMatch === 3 && lines.length > 1) {
      return this.binaryTranslate(lines, context);
    }
    throw new Error('翻译失败：重试次数过多');
  }

  private async translateLines(
    lines: string[],
    context?: SegmentContext,
  ): Promise<string[]> {
    const messages = this.promptBuilder(lines, context);
    const completion = await this.api.createChatCompletions({
      model: this.model,
      messages,
      temperature: 0.1,
      top_p: 0.3,
      max_tokens: Math.max(Math.ceil(lines.join('').length * 1.7), 100),
    });

    const content = completion.choices[0]?.message?.content ?? '';
    return this.parseAnswer(content);
  }

  private parseAnswer(answer: string): string[] {
    return answer
      .split('\n')
      .filter((s) => s.trim())
      .map((s, i) =>
        s
          .replace(`#${i + 1}:`, '')
          .replace(`#${i + 1}：`, '')
          .trim(),
      );
  }

  private async binaryTranslate(
    lines: string[],
    context?: SegmentContext,
  ): Promise<string[]> {
    const binary = async (left: number, right: number): Promise<string[]> => {
      if (left >= right) return [];
      if (right - left === 1) {
        const result = await this.translateLines([lines[left]], context);
        return result.length === 1 ? result : [lines[left]];
      }

      const mid = Math.floor((left + right) / 2);
      const [partLeft, partRight] = await Promise.all([
        binary(left, mid),
        binary(mid, right),
      ]);

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

      return fixedLeft.concat(fixedRight);
    };

    return binary(0, lines.length);
  }
}
