import { translateChapter } from '@auto-novel/translator/harness';
import type { HarnessPreset } from '@auto-novel/translator/harness/presets';
import type { ChapterTranslator } from '../TaskExecutor';

const isAbortError = (error: unknown) =>
  (error as { name?: string } | undefined)?.name === 'AbortError';

/**
 * 把所选模型预设包装成 TaskExecutor 可直接调用的“章节翻译函数”。
 *
 * 这里不经过 TranslationPipeline：章节并发由 Workspace 分配槽位控制。
 * 引擎按批串行请求，适配层把每个批次映射成一个分段进度项，
 * 让章节网格、预览和错误统计与 pipeline 模式共用同一套界面。
 */
export function createHarnessMode(
  preset: HarnessPreset,
  key: string,
  translatorId = preset.model,
): ChapterTranslator {
  return async (detail, tracker, signal) => {
    const segmentTracker = tracker.segmentTracker;
    try {
      return await translateChapter({
        source: detail.paragraphs,
        glossary: detail.glossary,
        preset,
        key,
        signal,
        onLog: tracker.onLog,
        onUsage: (record) => {
          segmentTracker?.harnessUsage.push(record);
        },
        onBatchesReady: (batches) => {
          if (!segmentTracker) return;
          segmentTracker.harness = true;
          segmentTracker.onSegmentsReady(detail.paragraphs, batches);
        },
        onBatchStart: (batch) => {
          segmentTracker?.onSegStart(batch.index, translatorId);
        },
        onReasoning: (record) => {
          segmentTracker?.reasoning.push(record);
        },
        onBatchComplete: (batch, translatedLines) => {
          segmentTracker?.onSegComplete(batch.index, translatedLines);
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        segmentTracker?.onAbort();
      } else {
        // 串行执行时只有当前批次处于 translating，直接复用现有分段状态定位。
        const index = segmentTracker?.segments.findIndex(
          (segment) => segment.status === 'translating',
        );
        if (index !== undefined && index >= 0) {
          segmentTracker?.onSegError(index, error);
        }
      }
      throw error;
    }
  };
}
