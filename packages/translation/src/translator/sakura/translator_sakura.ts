import type { SegmentContext, Translator, PromptBuilder } from '@/types';
import { createOpenAiApi } from '@/api/OpenAiApi';
import { createSakuraPromptBuilder } from './prompt_sakura';

export type SakuraVersion = '0.8' | '0.9' | '0.10' | '1.0';

export type SakuraTranslatorConfig = {
  type: 'sakura';
  endpoint: string;
  version?: SakuraVersion;
  prevSegLength?: number;
  promptBuilder?: PromptBuilder;
};

export class SakuraTranslator implements Translator {
  private api: ReturnType<typeof createOpenAiApi>;
  private version: SakuraVersion;
  private prevSegLength: number;
  private promptBuilder: NonNullable<SakuraTranslatorConfig['promptBuilder']>;

  constructor(config: SakuraTranslatorConfig) {
    this.api = createOpenAiApi(config.endpoint, 'no-key');
    this.version = config.version ?? '1.0';
    this.prevSegLength = config.prevSegLength ?? 500;
    this.promptBuilder =
      config.promptBuilder ?? createSakuraPromptBuilder(this.version);
  }

  async translate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (lines.length === 0) return [];
    const prevSegs = context?.prevSegs ?? [];
    const truncatedPrevSegs = this.truncatePrevSegs(prevSegs);
    const translateContext: SegmentContext = {
      ...context,
      prevSegs: truncatedPrevSegs,
    };

    let retry = 0;
    while (retry < 3) {
      const { text, hasDegradation } = await this.createChatCompletions(
        lines,
        translateContext,
        retry > 0,
        signal,
      );

      const splitText = text.replaceAll('<|im_end|>', '').split('\n');
      const linesNotMatched = lines.length !== splitText.length;

      if (!hasDegradation && !linesNotMatched) {
        return splitText;
      }
      retry++;
    }
    return this.translateLineByLine(lines, translateContext, signal);
  }

  private truncatePrevSegs(prevSegs: string[][]): string[][] {
    if (prevSegs.length === 0) return [];

    let charCount = 0;
    const result: string[][] = [];

    for (let i = prevSegs.length - 1; i >= 0; i--) {
      const seg = prevSegs[i];
      const segChars = seg.join('\n').length;
      if (charCount + segChars > this.prevSegLength) break;
      charCount += segChars;
      result.unshift(seg);
    }
    return result;
  }

  private async createChatCompletions(
    lines: string[],
    context?: SegmentContext,
    hasDegradation?: boolean,
    signal?: AbortSignal,
  ): Promise<{ text: string; hasDegradation: boolean }> {
    const messages = this.promptBuilder(lines, context);
    const text = lines.join('\n');
    const maxNewToken = Math.max(Math.ceil(text.length * 1.7), 100);

    const completion = await this.api.createChatCompletions(
      {
        model: '',
        messages,
        temperature: 0.1,
        top_p: 0.3,
        max_tokens: maxNewToken,
        frequency_penalty: hasDegradation ? 0.2 : 0.0,
      },
      { signal },
    );

    return {
      text: completion.choices[0]?.message?.content ?? '',
      hasDegradation: (completion.usage?.completion_tokens ?? 0) >= maxNewToken,
    };
  }

  private async translateLineByLine(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const prevSegs = context?.prevSegs ?? [];
    const resultPerLine: string[] = [];
    let degradationLineCount = 0;

    for (const line of lines) {
      signal?.throwIfAborted();

      const lineContext: SegmentContext = {
        ...context,
        prevSegs: [...prevSegs, resultPerLine],
      };

      const { text, hasDegradation } = await this.createChatCompletions(
        [line],
        lineContext,
        true,
        signal,
      );

      if (hasDegradation) {
        degradationLineCount++;
        if (degradationLineCount >= 2) {
          throw new Error('单个分段有2行退化，Sakura翻译器可能存在异常');
        }
        resultPerLine.push(line);
      } else {
        resultPerLine.push(text.replaceAll('<|im_end|>', ''));
      }
    }

    return resultPerLine;
  }
}
