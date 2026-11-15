import type {
  Logger,
  SegmentTracker,
  TranslationInput,
  TranslationResult,
} from '@auto-novel/translator';
import {
  translateChapter,
  type HarnessUsageRecord,
  type HarnessReasoningRecord,
} from '@auto-novel/translator/harness';
import type { HarnessPreset } from '@auto-novel/translator/harness/presets';

export interface HarnessSegmentTracker extends SegmentTracker {
  onHarnessStart?: () => void;
  onHarnessUsage?: (record: HarnessUsageRecord) => void;
  onHarnessReasoning?: (record: HarnessReasoningRecord) => void;
}

export type ChapterTranslator = (
  input: TranslationInput & { tracker?: HarnessSegmentTracker },
  signal: AbortSignal,
) => Promise<TranslationResult>;

const isAbortError = (error: unknown) =>
  (error as { name?: string } | undefined)?.name === 'AbortError';

/**
 * 保留整章上下文，把 Harness 批次映射为上游的分段事件和结算结果。
 */
export function createHarnessMode(
  preset: HarnessPreset,
  apiKey: string,
  translatorId = preset.model,
  log?: Logger,
): ChapterTranslator {
  return async (input, signal) => {
    const tracker = input.tracker;
    let currentBatchIndex: number | undefined;
    let tracking = true;
    const onAbort = () => {
      if (!tracking) return;
      tracking = false;
      tracker?.onAbort?.();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    try {
      signal.throwIfAborted();
      const lines = await translateChapter({
        source: [...input.lines],
        glossary: input.glossary ?? {},
        preset,
        apiKey,
        signal,
        onLog: (...args) => {
          if (tracking) log?.(...args);
        },
        onUsage: (record) => {
          if (tracking) tracker?.onHarnessUsage?.(record);
        },
        onBatchesReady: (batches) => {
          if (!tracking) return;
          tracker?.onHarnessStart?.();
          tracker?.onSegmentsReady?.(
            batches.map((batch) => ({
              id: String(batch.index),
              order: batch.index,
              lines: input.lines.slice(batch.start, batch.end),
            })),
          );
        },
        onBatchStart: (batch) => {
          if (!tracking) return;
          currentBatchIndex = batch.index;
          tracker?.onSegStart?.(batch.index, translatorId);
        },
        onReasoning: (record) => {
          if (tracking) tracker?.onHarnessReasoning?.(record);
        },
        onBatchComplete: (batch, translatedLines) => {
          if (!tracking) return;
          tracker?.onSegComplete?.(batch.index, translatedLines);
          currentBatchIndex = undefined;
        },
      });
      return { lines, failed: [] };
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        onAbort();
      } else {
        if (currentBatchIndex !== undefined) {
          tracker?.onSegError?.(currentBatchIndex, error);
        }
      }
      throw error;
    } finally {
      tracking = false;
      signal.removeEventListener('abort', onAbort);
    }
  };
}
