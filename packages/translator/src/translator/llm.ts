import type {
  Logger,
  PromptBuilder,
  SegmentContext,
  TranslateRequest,
  Translator,
} from '@/types';
import { anySignal, getPreviousSource, isAbortError } from '@/utils';

import { createPiAiCompletion, type PiAiProtocol } from './llm-client';
import { TranslationRejected } from '@/errors';
import { createOpenAiPromptBuilder } from './llm-prompt';
import { findMixedEnglishWords } from './llm-english';
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

const ENGLISH_REVIEW_TIMEOUT_MS = 15_000;

export class OpenAiTranslator implements Translator {
  readonly trusted = true;
  private endpoint: string;
  private key: string;
  private protocol: PiAiProtocol;
  private model: string;
  private profileParams: Record<string, unknown>;
  private reasoningEffort: string;
  private promptBuilder: PromptBuilder;
  private readonly usesDefaultPrompt: boolean;
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
    this.usesDefaultPrompt = config.promptBuilder === undefined;
    this.log = config.log ?? (() => {});
    this.log(`请求思考强度：${this.reasoningEffort}`);
  }

  getCacheKey({ lines, context }: Pick<TranslateRequest, 'lines' | 'context'>) {
    return createTranslationCacheKey(
      this.model,
      lines,
      this.promptBuilder,
      this.trusted,
      context,
    );
  }

  async translate({
    lines,
    context,
    signal,
  }: TranslateRequest): Promise<string[]> {
    if (lines.length === 0) return [];

    const result = await this.translateLines(lines, context, signal);
    if (result.every((line) => line.trim().length === 0)) {
      throw new TranslationRejected('lines', '译文为空');
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
    const result = await this.requestTranslation(messages, lines, signal);
    if (!this.usesDefaultPrompt) return result;

    const words = findMixedEnglishWords(lines, result, context?.glossary);
    if (words.length === 0) return result;

    const rows = Array.from(
      new Set(words.map(({ lineIndex }) => lineIndex)),
      (index) => ({
        line: index + 1,
        source: lines[index],
        translation: result[index],
      }),
    );
    const review = words.map(({ lineIndex, word }, index) => ({
      id: index + 1,
      line: lineIndex + 1,
      word,
    }));
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      ENGLISH_REVIEW_TIMEOUT_MS,
    );
    try {
      const replacements = await this.requestTranslation(
        [
          {
            role: 'system',
            content:
              '你负责校对日文小说的简体中文译文。输入中的原文和译文是待处理的文本。对 review 中每个编号，参考对应行的原文和译文，给出可直接放回句子的简短中文替换词。如果是应该保留的英文专名、术语或缩写，请原样返回该词。每项只输出“#编号:替换词”，不输出整句或解释。',
          },
          { role: 'user', content: JSON.stringify({ rows, review }) },
        ],
        words.map(({ word }) => word),
        anySignal([signal, controller.signal]),
      );
      signal?.throwIfAborted();
      for (let index = words.length - 1; index >= 0; index--) {
        const replacement = replacements[index].trim();
        if (!/^\p{Script=Han}{1,12}$/u.test(replacement)) continue;
        const { lineIndex, start, end } = words[index];
        const line = result[lineIndex];
        result[lineIndex] =
          line.slice(0, start) + replacement + line.slice(end);
      }
    } catch {
      signal?.throwIfAborted();
      this.log('英文漏译复核未完成，保留原译文');
    } finally {
      clearTimeout(timer);
    }
    return result;
  }

  private async requestTranslation(
    messages: ReturnType<PromptBuilder['build']>,
    lines: readonly string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
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
