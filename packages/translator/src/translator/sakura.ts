import type {
  Logger,
  SegmentContext,
  TranslateRequest,
  Translator,
  TranslatorProbe,
  PromptBuilder,
} from '@/types';

import { validateTranslationLines } from '@/pipeline/lines';
import { getPreviousSource, isAbortError } from '@/utils';
import { TranslationRejected } from '@/errors';
import { createOpenAiApi } from './sakura-client';
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

type SakuraModel = {
  readonly id: string;
  readonly meta: ModelMeta;
};

type ResolvedSakuraTranslatorConfig = {
  model?: SakuraModel;
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
  private readonly detectedModel?: SakuraModel;

  /** 探测结果只读公开；审批使用的模型及元数据在创建后不可变。 */
  get model(): SakuraModel | undefined {
    return this.detectedModel;
  }

  private constructor(config: ResolvedSakuraTranslatorConfig) {
    this.detectedModel = config.model;
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
    return new SakuraTranslator({
      model,
      api,
      version,
      prevSegLength: config.prevSegLength ?? 500,
      promptBuilder: config.promptBuilder ?? createSakuraPromptBuilder(version),
      log,
    });
  }

  /** 只有与本仓库登记过的模型一致时才允许把内容发往该端点。 */
  async probe(): Promise<TranslatorProbe> {
    const reason = this.modelRejection();
    if (reason !== undefined) {
      this.log(reason);
      return { approved: false, reason, info: this.modelInfo() };
    }
    this.log(`模型为${this.model?.id}，允许上传`);
    return { approved: true, info: this.modelInfo() };
  }

  /** 同步判定，供旧调用方使用。 */
  allowUpload(): boolean {
    const reason = this.modelRejection();
    if (reason !== undefined) {
      this.log(reason);
      return false;
    }
    this.log(`模型为${this.model?.id}，允许上传`);
    return true;
  }

  /** 不允许上传的原因；为空表示通过。 */
  private modelRejection(): string | undefined {
    if (this.prevSegLength !== 500) return '前文长度不是500';
    if (this.model === undefined) return '无法获取模型数据';
    const metaExpected = allowModels[this.model.id]?.meta;
    if (metaExpected === undefined) return `模型为${this.model.id}，禁止上传`;
    for (const key of Object.keys(metaExpected)) {
      if (this.model.meta[key] !== metaExpected[key]) {
        return '模型检查未通过，不要尝试欺骗模型检查';
      }
    }
    return undefined;
  }

  private modelInfo(): Record<string, string> | undefined {
    return this.model === undefined ? undefined : { model: this.model.id };
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
    return Object.freeze({
      id: model.id.replace(/(.gguf)$/, ''),
      meta: Object.freeze({ ...(model.meta as ModelMeta) }),
    });
  }

  private async createChatCompletions(
    lines: readonly string[],
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
    lines: readonly string[],
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
