import type {
  Logger,
  SegmentContext,
  TranslateRequest,
  Translator,
  PromptBuilder,
} from '@/types';

import { validateTranslationLines } from '@/translation-lines';
import { getPreviousSource, isAbortError } from '@/utils';
import { TranslationRejected } from './errors';
import { createOpenAiApi } from './openai-api';
import {
  allowModels,
  cleanSakuraOutput,
  createSakuraPromptBuilder,
  type ModelMeta,
} from './sakura-prompt';

export type SakuraVersion = '0.8' | '0.9' | '0.10' | '1.0';

export type SakuraTranslatorConfig = {
  endpoint: string;
  /** 前文原文的最大字符数；流水线默认提供最近 500 字符。 */
  prevSegLength?: number;
  promptBuilder?: PromptBuilder;
  log?: Logger;
};

type ResolvedSakuraTranslatorConfig = {
  api: ReturnType<typeof createOpenAiApi>;
  version: SakuraVersion;
  prevSegLength: number;
  promptBuilder: PromptBuilder;
  log: Logger;
};

export class SakuraTranslator implements Translator {
  private api: ReturnType<typeof createOpenAiApi>;
  private version: SakuraVersion;
  private prevSegLength: number;
  private promptBuilder: PromptBuilder;
  readonly log: Logger;
  model?: {
    id: string;
    meta: ModelMeta;
  };

  private constructor(config: ResolvedSakuraTranslatorConfig) {
    this.api = config.api;
    this.version = config.version;
    this.prevSegLength = config.prevSegLength;
    this.promptBuilder = config.promptBuilder;
    this.log = config.log;
  }

  get currentVersion(): SakuraVersion {
    return this.version;
  }

  static async create(config: SakuraTranslatorConfig) {
    const api = createOpenAiApi(config.endpoint, 'no-key');
    const log = config.log ?? (() => {});
    const model = await SakuraTranslator.detectModel(api, log);
    const version = SakuraTranslator.detectVersion(model?.id);
    const translator = new SakuraTranslator({
      api,
      version,
      prevSegLength: config.prevSegLength ?? 500,
      promptBuilder: config.promptBuilder ?? createSakuraPromptBuilder(version),
      log,
    });
    translator.model = model;
    return translator;
  }

  allowUpload() {
    if (this.prevSegLength !== 500) {
      this.log('前文长度不是500');
      return false;
    }

    if (this.model === undefined) {
      this.log('无法获取模型数据');
      return false;
    }

    const metaCurrent = this.model.meta;
    const metaExpected = allowModels[this.model.id]?.meta;
    if (metaExpected === undefined) {
      this.log(`模型为${this.model.id}，禁止上传`);
      return false;
    }

    for (const key in metaExpected) {
      if (metaCurrent[key] !== metaExpected[key]) {
        this.log('模型检查未通过，不要尝试欺骗模型检查');
        return false;
      }
    }
    this.log(`模型为${this.model.id}，允许上传`);
    return true;
  }

  async translate({
    lines,
    context,
    signal,
    attempt,
  }: TranslateRequest): Promise<string[]> {
    if (lines.length === 0) return [];
    const translateContext = this.contextFor(context);

    let text: string;
    let hasDegradation: boolean;
    try {
      ({ text, hasDegradation } = await this.createChatCompletions(
        lines,
        translateContext,
        attempt > 0,
        signal,
      ));
    } catch (error) {
      if (error instanceof TranslationRejected || isAbortError(error)) {
        throw error;
      }
      this.log(`API 错误：${error}`);
      throw new TranslationRejected('request', String(error), error);
    }

    let splitText: string[];
    try {
      splitText = this.promptBuilder.parseAnswer(text, lines);
      validateTranslationLines(lines, splitText);
    } catch (error) {
      this.log(`输出错误：${error}`, [lines.join('\n'), text]);
      throw new TranslationRejected('lines', String(error), error);
    }
    if (hasDegradation) {
      this.log('退化', [lines.join('\n'), text]);
      throw new TranslationRejected('degraded', '输出退化');
    }
    return splitText;
  }

  /** 整段始终退化时逐行翻译；单段连续两行退化视为翻译器异常。 */
  async fallback({
    lines,
    context,
    signal,
  }: TranslateRequest): Promise<string[]> {
    this.log('逐行翻译');
    return this.translateLineByLine(lines, this.contextFor(context), signal);
  }

  /** 按配置裁剪前文原文。 */
  private contextFor(context?: SegmentContext): SegmentContext {
    return {
      ...context,
      previousSource: getPreviousSource(
        [context?.previousSource ?? ''],
        1,
        this.prevSegLength,
      ),
    };
  }

  private static detectVersion(id?: string): SakuraVersion {
    if (id?.includes('0.8')) return '0.8';
    if (id?.includes('0.9')) return '0.9';
    if (id?.includes('0.10')) return '0.10';
    if (id?.includes('1.0')) return '1.0';
    return '1.0';
  }

  private static async detectModel(
    api: ReturnType<typeof createOpenAiApi>,
    log: Logger,
  ) {
    const modelsPage = await api
      .listModels({
        headers: {
          'ngrok-skip-browser-warning': '69420',
        },
      })
      .catch((e) => {
        log(`获取模型数据失败：${e}`);
      });
    const model = modelsPage?.data[0];
    if (model === undefined) {
      return undefined;
    }
    return {
      id: model.id.replace(/(.gguf)$/, ''),
      meta: model.meta as ModelMeta,
    };
  }

  private async createChatCompletions(
    lines: string[],
    context?: SegmentContext,
    hasDegradation?: boolean,
    signal?: AbortSignal,
  ): Promise<{ text: string; hasDegradation: boolean }> {
    const messages = this.promptBuilder.build(lines, context);
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
      {
        signal,
        timeout: false,
      },
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
    const sourceLines = context?.previousSource
      ? [context.previousSource, ...lines]
      : lines;
    const sourceOffset = sourceLines.length - lines.length;
    const resultPerLine: string[] = [];
    let degradationLineCount = 0;

    for (const [index, line] of lines.entries()) {
      signal?.throwIfAborted();

      const lineContext: SegmentContext = {
        ...context,
        previousSource: getPreviousSource(
          sourceLines,
          sourceOffset + index,
          this.prevSegLength,
        ),
      };

      const { text, hasDegradation } = await this.createChatCompletions(
        [line],
        lineContext,
        true,
        signal,
      );

      if (hasDegradation) {
        degradationLineCount++;
        this.log(`单行退化${degradationLineCount}次`, [line, text]);
        if (degradationLineCount >= 2) {
          throw new Error('单个分段有2行退化，Sakura翻译器可能存在异常');
        }
        resultPerLine.push(line);
      } else {
        // 单行译文不能含换行，否则上传时按行切分会与原文行数不匹配
        resultPerLine.push(cleanSakuraOutput(text).replaceAll('\n', ''));
      }
    }

    return resultPerLine;
  }
}
