/**
 * 「Harness」翻译器：不经过 TranslationPipeline 的分块调度，直接把整章按固定
 * 批大小发给模型，由模型返回整段译文。
 *
 * 与 pipeline 模式的区别：
 * - pipeline 把章节切成不定长分块，交给多个翻译器并行领取；
 * - harness 以章节为单位、按批串行请求，适合需要完整上下文的预设。
 *
 * 为了保证模型输出能和原文逐段对齐，每段原文都会带一个稳定编号
 * （p0000、p0001…）。模型每次只翻译当前批次，但仍能看到整章原文、
 * 术语表和已经翻好的部分，从而保持称谓、语气和上下文一致。
 */
import type { Glossary, Logger, LineRange } from '../types';
import type { Usage } from '@earendil-works/pi-ai';
import { createPiAiCompletion } from '../translator/llm-client';
import type { HarnessPreset } from './presets';
import {
  outputInstructions,
  parseBatchOutput,
  type HarnessParagraph,
} from './output';

export interface HarnessUsageRecord {
  model: string;
  batch: number;
  /** 本次请求的可读标签：首次、修正 n、二分。 */
  attemptLabel?: string;
  /** 本次请求覆盖的原文行区间；二分后会小于顶层批次。 */
  start?: number;
  end?: number;
  usage: Usage;
}

/** 一次模型响应携带的思考内容；纠正和二分产生的中间请求也会各记一条。 */
export interface HarnessReasoningRecord {
  batch: number;
  attemptLabel: string;
  start: number;
  end: number;
  reasoning: string;
}

/** 一批原文在整章中的位置；index 为从 0 开始的批序号。 */
export interface HarnessBatch extends LineRange {
  index: number;
}

export interface HarnessInput {
  source: string[];
  glossary: Glossary;
  preset: HarnessPreset;
  apiKey: string;
  signal?: AbortSignal;
  onLog?: Logger;
  onUsage?: (record: HarnessUsageRecord) => void;
  /** 翻译开始前一次性给出整章批次划分，便于界面预先建立进度项。 */
  onBatchesReady?: (batches: HarnessBatch[]) => void;
  onBatchStart?: (batch: HarnessBatch) => void;
  /** 模型返回后立刻给出思考内容；在译文校验前触发，解析失败也能保留。 */
  onReasoning?: (record: HarnessReasoningRecord) => void;
  /** 完成事件携带与 source[start, end) 逐段对齐的译文。 */
  onBatchComplete?: (batch: HarnessBatch, translatedLines: string[]) => void;
}

/**
 * 单个批次包含的原文段数。批次太大容易超出模型上下文，太小则会丢失
 * 段落之间的语境，还会增加请求次数。
 */
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_RETRY_COUNT = 3;
/** 段落编号固定 4 位，保证按字符串排序时顺序仍与原文一致。 */
const paragraphId = (index: number) => `p${String(index).padStart(4, '0')}`;

const planBatches = (total: number): HarnessBatch[] => {
  const batches: HarnessBatch[] = [];
  for (
    let start = 0, index = 0;
    start < total;
    start += DEFAULT_BATCH_SIZE, index++
  ) {
    batches.push({
      index,
      start,
      end: Math.min(start + DEFAULT_BATCH_SIZE, total),
    });
  }
  return batches;
};

/**
 * 把带编号的段落拼成多行文本，供提示词使用。
 * 空行不发送，也不会占用编号；start 用于让批次内的编号延续整章序号。
 */
const toParagraphs = (lines: string[], start = 0): HarnessParagraph[] =>
  lines.flatMap((text, index) =>
    text.trim() ? [{ id: paragraphId(start + index), text }] : [],
  );

const numberedLines = (paragraphs: HarnessParagraph[]) =>
  paragraphs.map(({ id, text }) => `${id}#${text}`).join('\n');

export async function translateChapter({
  source,
  glossary,
  preset,
  apiKey,
  signal,
  onLog,
  onUsage,
  onBatchesReady,
  onBatchStart,
  onReasoning,
  onBatchComplete,
}: HarnessInput): Promise<string[]> {
  const translated: string[] = [];
  // 每次请求都会重复带上整章原文和术语表：模型看到当前批次之外的内容后，
  // 更容易保持人物称谓、语气和专有名词的一致。这部分只作为输入，不产生译文输出。
  const prefix = [
    `<chapter_source>\n${numberedLines(toParagraphs(source))}\n</chapter_source>`,
    `<glossary>\n${Object.entries(glossary)
      .map(([jp, zh]) => `${jp} => ${zh}`)
      .join('\n')}\n</glossary>`,
  ].join('\n\n');

  const batches = planBatches(source.length);
  onBatchesReady?.(batches);

  const translateBatch = async (
    batch: HarnessBatch,
    previous: string[],
    attemptLabel: string,
  ): Promise<string[]> => {
    const lines = source.slice(batch.start, batch.end);
    // 只把非空段落计入本批：空行原样保留，不需要也不应该让模型翻译。
    const paragraphs = toParagraphs(lines, batch.start);
    const count = paragraphs.length;
    if (count === 0) return lines;
    let retryPrompt = '';
    for (let attempt = 0; attempt <= MAX_BATCH_RETRY_COUNT; attempt++) {
      signal?.throwIfAborted();
      const requestLabel =
        attempt === 0 ? attemptLabel : `${attemptLabel} · 修正 ${attempt}`;
      // 请求结构：system 放翻译规则和输出格式；user 按
      // 「整章原文 → 已译内容 → 当前批次」摆放，最后明确要求返回本批译文。
      // 把 current_batch 放在最后，模型更容易把注意力落在真正要翻译的段落上。
      try {
        const response = await createPiAiCompletion({
          protocol: preset.protocol,
          endpoint: preset.endpoint,
          model: preset.model,
          key: apiKey,
          signal,
          messages: [
            {
              role: 'system',
              content: `${preset.rules}\n全章原文和已译部分供理解上下文，只翻译 current_batch。
${outputInstructions[preset.outputFormat]}
每段对应一行非空译文，不要合并或拆分段落。`,
            },
            {
              role: 'user',
              content: [
                prefix,
                `<translated_so_far>\n${numberedLines(toParagraphs(previous))}\n</translated_so_far>`,
                `<current_batch>\n${numberedLines(paragraphs)}\n</current_batch>`,
                `请返回本批 ${count} 段的译文。`,
                retryPrompt,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
          requestParams: preset.requestParams,
          cost: preset.cost,
          onUsage: (usage) =>
            onUsage?.({
              model: preset.model,
              batch: batch.index + 1,
              attemptLabel: requestLabel,
              start: batch.start,
              end: batch.end,
              usage,
            }),
        });
        signal?.throwIfAborted();
        // 思考内容在解析前上报：即便这一批最终校验失败，也能在界面里看到原因。
        if (response.reasoning) {
          onReasoning?.({
            batch: batch.index + 1,
            attemptLabel: requestLabel,
            start: batch.start,
            end: batch.end,
            reasoning: response.reasoning,
          });
        }
        const translations = parseBatchOutput(
          response.text,
          preset.outputFormat,
          paragraphs,
        );
        let index = 0;
        return lines.map((line) =>
          // 恢复原文的段首空格缩进。
          line.trim()
            ? line.match(/^\s*/)![0] + translations[index++].trim()
            : line,
        );
      } catch (error) {
        // 请求失败与输出校验失败共用恢复次数，只有主动取消立即退出。
        signal?.throwIfAborted();
        if (attempt === MAX_BATCH_RETRY_COUNT) {
          // 仅剩一段需要翻译时无法继续细分，直接将错误交给上层。
          if (count === 1) throw error;
          break;
        }
        retryPrompt = `上次翻译失败：${(error as Error).message}。请按规定格式重新返回当前批次完整的 ${count} 段译文，不要只补漏段。`;
        onLog?.(
          `批次 ${batch.index + 1}，${paragraphs[0].id}-${paragraphs[count - 1].id} 修正 ${attempt + 1}/${MAX_BATCH_RETRY_COUNT}：${(error as Error).message}`,
        );
      }
    }

    onLog?.(`批次 ${batch.index + 1}，${count} 段修正失败，二分翻译`);
    const mid = Math.floor((batch.start + batch.end) / 2);
    const left = await translateBatch({ ...batch, end: mid }, previous, '二分');
    const right = await translateBatch(
      { ...batch, start: mid },
      [...previous, ...left],
      '二分',
    );
    return [...left, ...right];
  };

  // 顶层批次进度只在整批恢复成功后完成；
  for (const batch of batches) {
    signal?.throwIfAborted();
    onBatchStart?.(batch);
    onLog?.(`翻译批次 ${batch.index + 1}/${batches.length}`);
    const translatedLines = await translateBatch(batch, translated, '首次请求');
    translated.push(...translatedLines);
    onBatchComplete?.(batch, translatedLines);
  }
  return translated;
}
