import { createOpenAiApi } from '@/api/third-party/OpenAiApi';
import type { Glossary } from '@/model/Glossary';

import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createLengthSegmentor } from './Common';

const THINK_PATTERN_CLOSED = /<think>[\s\S]*?<\/think>/gi;
const THINK_PATTERN_OPEN = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const CHINESE_CHAR_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LEADING_COMMENT_LINE_PATTERN =
  /^\s*(?:翻译(?:如下|结果)?|译文(?:如下)?|以下是译文|以下翻译|输出|答案)(?:[:：]\s*)?$/;

export class MurasakiTranslator implements SegmentTranslator {
  id = <const>'murasaki';
  log: (message: string, detail?: string[]) => void;
  private api;
  version: string = '1.0';
  model?: {
    id: string;
    meta?: MurasakiTranslator.ModelMeta;
  };
  segmentor = createLengthSegmentor(1000);
  segLength = 1000;
  // Murasaki does not provide cross-segment previous context.
  prevSegLength = 0;

  constructor(
    log: Logger,
    { endpoint, segLength, prevSegLength }: MurasakiTranslator.Config,
  ) {
    this.log = log;
    this.api = createOpenAiApi(endpoint, 'no-key');
    if (segLength !== undefined) {
      this.segmentor = createLengthSegmentor(segLength);
      this.segLength = segLength;
    }
    if (prevSegLength !== undefined) {
      this.prevSegLength = prevSegLength;
    }
  }

  async init() {
    this.model = (await this.detectModel()) as typeof this.model;
    if (this.model?.id) {
      this.version = MurasakiTranslator.inferVersion(this.model.id);
    }
    console.log('Model:');
    console.log(this.model);
    return this;
  }

  allowUpload = () => {
    const policy = MurasakiTranslator.uploadPolicy;

    if (
      policy.enforceSegLength &&
      this.segLength !== policy.expectedSegLength
    ) {
      this.log(`分段长度不是${policy.expectedSegLength}`);
      return false;
    }
    if (
      policy.enforcePrevSegLength &&
      this.prevSegLength !== policy.expectedPrevSegLength
    ) {
      this.log(`前文长度不是${policy.expectedPrevSegLength}`);
      return false;
    }

    if (this.model === undefined) {
      if (policy.requireModelInfo) {
        this.log('无法获取模型数据');
        return false;
      }
      this.log('无法获取模型数据，按宽松策略允许上传');
      return true;
    }

    const normalizedId = MurasakiTranslator.normalizeModelId(this.model.id);
    const metaCurrent = this.model.meta ?? {};
    const allowModel = MurasakiTranslator.allowModels[normalizedId];
    const inAllowList =
      allowModel !== undefined ||
      MurasakiTranslator.allowModelPatterns.some((it) => it.test(normalizedId));

    if (policy.requireModelInAllowList && !inAllowList) {
      this.log(`模型为${this.model.id}，禁止上传`);
      return false;
    }

    if (policy.requireMetaExactMatch && allowModel?.meta) {
      for (const key in allowModel.meta) {
        if (metaCurrent[key] !== allowModel.meta[key]) {
          this.log('模型检查未通过，不要尝试欺骗模型检查');
          return false;
        }
      }
    }

    this.log(`模型为${this.model.id}，允许上传`);
    return true;
  };

  async translate(
    seg: string[],
    { glossary, prevSegs, signal }: SegmentContext,
  ): Promise<string[]> {
    // Keep original paragraph layout (blank-line counts/positions), but send only
    // effective text lines to the model using single '\n' separators.
    const layout = MurasakiTranslator.captureSourceLayout(seg);
    if (layout.effectiveLines.length === 0) {
      return seg.map(() => '');
    }

    const concatedSeg = layout.effectiveLines.join('\n');
    // Keep previous-context window disabled when prevSegLength <= 0.
    const prevSegCount =
      this.prevSegLength <= 0
        ? 0
        : -Math.ceil(this.prevSegLength / this.segLength);
    const concatedPrevSeg =
      prevSegCount === 0 ? '' : prevSegs.slice(prevSegCount).flat().join('\n');

    let retry = 1;
    while (retry <= MurasakiTranslator.retryPolicy.segmentRetryLimit) {
      const { text, hasDegradation } = await this.createChatCompletions(
        concatedSeg,
        glossary,
        concatedPrevSeg,
        signal,
      );
      // Rebuild the original blank-line layout after translation.
      // If effective-line counts do not match, treat as line mismatch and retry.
      const splitText = MurasakiTranslator.restoreLinesByLayout(layout, text);

      const linesNotMatched = splitText === undefined;
      const parts: string[] = [`第${retry}次`];
      if (hasDegradation) {
        parts.push('退化');
      } else if (linesNotMatched) {
        parts.push('行数不匹配');
      } else {
        parts.push('成功');
      }
      this.log(parts.join('，'), [seg.join('\n'), text]);

      if (!hasDegradation && splitText !== undefined) {
        return splitText;
      }
      retry += 1;
    }

    this.log('逐行翻译');
    let degradationLineCount = 0;
    const resultPerLine: string[] = [];
    for (const line of seg) {
      if (MurasakiTranslator.isBlankLine(line)) {
        resultPerLine.push('');
        continue;
      }

      const { text, hasDegradation } = await this.createChatCompletions(
        line,
        glossary,
        [concatedPrevSeg, ...resultPerLine].join('\n'),
        signal,
      );
      if (hasDegradation) {
        degradationLineCount += 1;
        this.log(`单行退化第${degradationLineCount}次`, [line, text]);
        if (
          degradationLineCount >=
          MurasakiTranslator.retryPolicy.perLineDegradationLimit
        ) {
          throw Error('单个分段退化次数过多，Murasaki翻译器可能存在异常');
        }
        resultPerLine.push(line);
      } else {
        resultPerLine.push(MurasakiTranslator.pickSingleLineTranslation(text));
      }
    }
    return resultPerLine;
  }

  private async detectModel() {
    const modelsPage = await this.api
      .listModels({
        headers: {
          'ngrok-skip-browser-warning': '69420',
        },
      })
      .catch((e) => {
        this.log(`获取模型数据失败：${e}`);
      });
    const model = modelsPage?.data[0];
    if (model === undefined) {
      return undefined;
    }
    return {
      id: MurasakiTranslator.normalizeModelId(model.id),
      meta: (model.meta ?? undefined) as
        | MurasakiTranslator.ModelMeta
        | undefined,
    };
  }

  private async createChatCompletions(
    text: string,
    glossary: Glossary,
    prevText: string,
    signal?: AbortSignal,
  ) {
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [];
    const system = (content: string) =>
      messages.push({ role: 'system', content });
    const user = (content: string) => messages.push({ role: 'user', content });
    const assistant = (content: string) =>
      messages.push({ role: 'assistant', content });

    text = text.replace(/[\uff10-\uff19]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    );

    const glossaryHint = MurasakiTranslator.formatGlossary(glossary);
    if (glossaryHint.length > 0) {
      system(
        MurasakiTranslator.NOVEL_SYSTEM_PROMPT_WITH_GLOSSARY.replace(
          '{glossary}',
          glossaryHint,
        ),
      );
    } else {
      system(MurasakiTranslator.NOVEL_SYSTEM_PROMPT);
    }

    if (prevText !== '') {
      assistant(prevText);
    }

    user(`请翻译：\n${text}`);

    const maxNewToken = MurasakiTranslator.defaultSampling.maxTokens;
    const completion = await this.api.createChatCompletions(
      {
        model: '',
        messages,
        temperature: MurasakiTranslator.defaultSampling.temperature,
        top_p: MurasakiTranslator.defaultSampling.topP,
        max_tokens: maxNewToken,
        frequency_penalty: MurasakiTranslator.defaultSampling.frequencyPenalty,
      },
      {
        signal,
        timeout: false,
      },
    );

    const completionTokens = completion.usage?.completion_tokens ?? 0;
    return {
      text: completion.choices[0].message.content ?? '',
      hasDegradation: completionTokens >= maxNewToken,
    };
  }
}

export namespace MurasakiTranslator {
  export interface Config {
    endpoint: string;
    segLength?: number;
    prevSegLength?: number;
  }

  export const create = (log: Logger, config: Config) =>
    new MurasakiTranslator(log, config).init();

  export type ModelMetaValue = string | number | boolean;
  export type ModelMeta = Record<string, ModelMetaValue>;
  export type AllowModel = {
    repo: string;
    file: string;
    meta?: ModelMeta;
  };

  export const allowModels: {
    [key: string]: AllowModel;
  } = {
    'murasaki-14b-v0.2-iq4_xs': {
      repo: 'Murasaki-Project/Murasaki-14B-v0.2-GGUF',
      file: 'Murasaki-14B-v0.2-IQ4_XS.gguf',
      meta: {
        n_vocab: 151936,
        n_ctx_train: 32768,
        n_embd: 5120,
        size: 8104770560,
      },
    },
    'murasaki-14b-v0.2-q6_k': {
      repo: 'Murasaki-Project/Murasaki-14B-v0.2-GGUF',
      file: 'Murasaki-14B-v0.2-Q6_K.gguf',
      meta: {
        n_vocab: 151936,
        n_ctx_train: 32768,
        n_embd: 5120,
        size: 12121937216,
      },
    },
  };

  export const allowModelPatterns = [
    /^(murasaki-14b-v0\.2-iq4_xs|murasaki-14b-v0\.2-q6_k)$/i,
  ];

  export const defaultSampling = {
    temperature: 0.3,
    topP: 0.95,
    frequencyPenalty: 0,
    maxTokens: 4096,
  } as const;

  export const retryPolicy = {
    segmentRetryLimit: 3,
    perLineDegradationLimit: 2,
  } as const;

  export const uploadPolicy = {
    enforceSegLength: true,
    expectedSegLength: 1000,
    enforcePrevSegLength: true,
    expectedPrevSegLength: 0,
    requireModelInfo: true,
    requireModelInAllowList: true,
    requireMetaExactMatch: true,
  } as const;

  export const NOVEL_SYSTEM_PROMPT = `你是一位精通二次元文化的资深轻小说翻译家。
请将日文文本翻译成流畅、优美的中文。

**核心要求：**
1. **深度思考：** 在翻译前，先在 <think> 标签中分析文风、补全主语并梳理逻辑。
2. **信达雅：** 译文需符合中文轻小说阅读习惯，还原原作的沉浸感与文学性。`;

  export const NOVEL_SYSTEM_PROMPT_WITH_GLOSSARY = `你是一位精通二次元文化的资深轻小说翻译家。
请将日文文本翻译成流畅、优美的中文。

**核心要求：**
1. **深度思考：** 在翻译前，先在 <think> 标签中分析文风、补全主语并梳理逻辑。
2. **信达雅：** 译文需符合中文轻小说阅读习惯，还原原作的沉浸感与文学性。

【术语表】
{glossary}`;

  export const normalizeModelId = (id: string) =>
    id
      .trim()
      .replace(/(.gguf)$/i, '')
      .replace(/^Murasaki-Project\//i, '')
      .toLowerCase();

  export const inferVersion = (id: string) => {
    const normalized = normalizeModelId(id);
    const matched = normalized.match(/v(\d+\.\d+)/i);
    return matched?.[1] ?? '1.0';
  };

  export const formatGlossary = (glossary: Glossary) => {
    const entries = Object.entries(glossary).sort(([a], [b]) =>
      a.localeCompare(b, 'ja-JP'),
    );
    if (entries.length === 0) {
      return '';
    }
    return JSON.stringify(Object.fromEntries(entries));
  };

  export const stripThinkTags = (text: string) => {
    if (!text) return '';

    const noImEnd = text.replaceAll('<|im_end|>', '').replaceAll('\r\n', '\n');
    let cleaned = noImEnd.replace(THINK_PATTERN_CLOSED, '');
    if (cleaned === noImEnd) {
      cleaned = noImEnd.replace(THINK_PATTERN_OPEN, '');
    }
    return cleaned.replace(/<think>|<\/think>/gi, '').trim();
  };

  export const trimLeadingNoise = (text: string) => {
    if (!text) return '';

    const lines = text.split('\n');
    while (lines.length > 0 && LEADING_COMMENT_LINE_PATTERN.test(lines[0])) {
      lines.shift();
    }

    const firstChineseLine = lines.findIndex((line) =>
      CHINESE_CHAR_PATTERN.test(line),
    );
    if (firstChineseLine > 0) {
      return lines.slice(firstChineseLine).join('\n');
    }
    return lines.join('\n');
  };

  export const normalizeTranslatedText = (raw: string) =>
    trimLeadingNoise(stripThinkTags(raw));

  export const splitTranslatedLines = (raw: string) =>
    normalizeTranslatedText(raw)
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''));

  export const isBlankLine = (line: string) => line.trim().length === 0;

  export interface SourceLayout {
    effectiveLines: string[];
    blankLineCounts: number[];
  }

  export const captureSourceLayout = (source: string[]): SourceLayout => {
    // blankLineCounts[i] means: number of blank lines before effectiveLines[i].
    // The last item stores trailing blank lines after the final effective line.
    const effectiveLines: string[] = [];
    const blankLineCounts: number[] = [0];

    for (const line of source) {
      if (isBlankLine(line)) {
        blankLineCounts[blankLineCounts.length - 1] += 1;
      } else {
        effectiveLines.push(line);
        blankLineCounts.push(0);
      }
    }

    return { effectiveLines, blankLineCounts };
  };

  export const restoreLinesByLayout = (layout: SourceLayout, raw: string) => {
    // The model output is normalized, then compared by effective-line count only.
    // If matched, blank lines are mechanically restored from recorded layout.
    const translatedLines = splitTranslatedLines(raw);
    const translatedEffectiveLines = translatedLines.filter(
      (line) => !isBlankLine(line),
    );
    if (translatedEffectiveLines.length !== layout.effectiveLines.length) {
      return undefined;
    }

    const aligned: string[] = [];
    for (let i = 0; i < layout.effectiveLines.length; i += 1) {
      for (let j = 0; j < layout.blankLineCounts[i]; j += 1) {
        aligned.push('');
      }
      const translated = translatedEffectiveLines[i];
      if (translated === undefined) {
        return undefined;
      }
      aligned.push(translated);
    }
    for (
      let j = 0;
      j < layout.blankLineCounts[layout.blankLineCounts.length - 1];
      j += 1
    ) {
      aligned.push('');
    }

    return aligned;
  };

  export const pickSingleLineTranslation = (raw: string) => {
    const lines = splitTranslatedLines(raw).filter(
      (line) => line.trim().length > 0,
    );
    if (lines.length === 0) {
      return '';
    }
    return lines[0];
  };
}
