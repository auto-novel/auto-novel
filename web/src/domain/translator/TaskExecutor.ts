import type { TranslationWork } from '@auto-novel/translator';
import type {
  ChapterMeta,
  ChapterStatus,
  ChapterSegmentState,
} from './TaskState';
import type {
  TranslationTask,
  PreparedMetadata,
} from './TranslationTask/types';

export type ChapterTracker = {
  onChapterStatus: (chapterId: string, status: ChapterStatus) => void;
  onLog: (msg: string) => void;
  segmentTracker?: ChapterSegmentState;
};

/** 取消等待不支持 signal 的底层调用；仍接住其迟到结果。 */
function awaitWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

export class TaskExecutor {
  constructor(private task: TranslationTask) {}

  /** 获取翻译单元；翻译与保存回调统一交给流水线。零行元数据直接保存。 */
  async prepareUnit(
    unit: ChapterMeta,
    tracker: ChapterTracker,
    signal?: AbortSignal,
  ): Promise<TranslationWork | undefined> {
    const isMetadata = unit.kind === 'metadata';
    const chapterId = unit.chapterId;
    const title = unit.title;
    const setStatus = (status: ChapterStatus) =>
      tracker.onChapterStatus(chapterId, status);
    const markError = () => setStatus('error');
    const markPending = () => setStatus('pending');
    const onError = (error: unknown) => {
      if (
        signal?.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        markPending();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = message;
      markError();
      tracker.onLog(`[${title}] ❌ 失败: ${message}`);
    };
    if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = undefined;

    try {
      signal?.throwIfAborted();
      if (!this.task.initialized) throw new Error('翻译任务尚未初始化');
      const context = {
        signal: signal ?? new AbortController().signal,
        onLog: tracker.onLog,
      };
      let prepared: PreparedMetadata;
      let history: TranslationWork['history'];
      if (isMetadata) {
        if (
          this.task.metadataUnit?.kind !== 'metadata' ||
          this.task.metadataUnit.chapterId !== unit.chapterId ||
          !this.task.prepareMetadata
        ) {
          throw new Error('元数据单元不存在或已失效');
        }
        tracker.onLog(`[${title}] 开始获取原文`);
        prepared = await awaitWithSignal(
          this.task.prepareMetadata(context),
          signal,
        );
      } else {
        if (
          !this.task.chapters.some((chapter) => chapter.chapterId === chapterId)
        ) {
          throw new Error(`章节 ${chapterId} 不存在或已失效`);
        }
        tracker.onLog(`[${title}] 开始获取原文`);
        const detail = await awaitWithSignal(
          this.task.fetchChapter(chapterId, context),
          signal,
        );
        // 单段内的换行不是段落分隔符，避免译文错位。
        const paragraphs = detail.paragraphs.map((line) =>
          line.replace(/[\r\n]/g, ''),
        );
        history =
          this.task.level !== 'all' && detail.oldParagraphZh
            ? {
                lines: paragraphs,
                translatedLines: detail.oldParagraphZh,
                glossary: detail.oldGlossary ?? {},
              }
            : undefined;
        prepared = {
          lines: paragraphs,
          glossary: detail.glossary,
          save: (lines) =>
            this.task.uploadChapter(
              chapterId,
              detail.glossaryId,
              lines,
              context,
            ),
        };
      }
      signal?.throwIfAborted();
      setStatus('translating');
      const save = async (lines: string[]) => {
        signal?.throwIfAborted();
        if (lines.length !== prepared.lines.length)
          throw new Error('翻译结果数量不匹配');
        await prepared.save(lines);
        // 保存成功后即使立即停止也视为完成，避免重复上传。
        setStatus('done');
        tracker.onLog(`[${title}] ✅ 完成`);
      };
      if (isMetadata && prepared.lines.length === 0) {
        tracker.segmentTracker?.onSegmentsReady([]);
        await save([]);
        return undefined;
      }
      tracker.onLog(`[${title}] 开始翻译`);
      return {
        trustedOnly: this.task.type !== 'local',
        lines: prepared.lines,
        glossary: prepared.glossary,
        history,
        tracker: tracker.segmentTracker,
        onComplete: async (result) => {
          signal?.throwIfAborted();
          if (result.failed.length > 0) {
            markError();
            tracker.onLog(
              `[${title}] ⚠️ ${result.failed.length} 个分段翻译失败，已回退为原文`,
            );
            return;
          }
          await save(result.lines);
        },
        onError,
        onAbort: markPending,
      };
    } catch (error) {
      onError(error);
      return undefined;
    }
  }
}
