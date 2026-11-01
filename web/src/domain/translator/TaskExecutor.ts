import type { TranslationWork } from '@auto-novel/translator';
import type { ChapterStatus, ChapterSegmentState } from './TaskState';
import type { TranslationTask } from './TranslationTask/types';

export type ChapterTracker = {
  onChapterStatus: (chapterId: string, status: ChapterStatus) => void;
  onProgress: (finished: number, error: number, total: number) => void;
  onLog: (msg: string) => void;
  segmentTracker?: ChapterSegmentState;
};

export class TaskExecutor {
  constructor(
    private task: TranslationTask,
    /** 任务仍有效且允许保存／更新来源；翻译器派发审批由流水线负责。 */
    private canUpdateProvider?: () => boolean,
  ) {}

  /** 获取章节；翻译和保存由流水线拉取后执行。 */
  async prepareChapter(
    chapterId: string,
    tracker: ChapterTracker,
    signal?: AbortSignal,
  ): Promise<TranslationWork | undefined> {
    let title = chapterId;
    const updateProgress = () => {
      const chapters = this.task.chapters;
      const finished = chapters.filter((ch) => ch.status === 'done').length;
      const errors = chapters.filter((ch) => ch.status === 'error').length;
      tracker.onProgress(finished, errors, chapters.length);
    };
    /** 标记失败并刷新进度；fetch、翻译、保存失败都走这里。 */
    const markChapterError = () => {
      tracker.onChapterStatus(chapterId, 'error');
      updateProgress();
    };
    const markChapterPending = () =>
      tracker.onChapterStatus(chapterId, 'pending');
    const onError = (error: unknown) => {
      if (
        signal?.aborted ||
        this.canUpdateProvider?.() === false ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        markChapterPending();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = message;
      markChapterError();
      tracker.onLog(`[${title}] ❌ 失败: ${message}`);
    };

    if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = undefined;

    const checkExecution = () => {
      signal?.throwIfAborted();
      if (this.canUpdateProvider?.() === false)
        throw new DOMException('任务已失效或不允许保存', 'AbortError');
    };
    try {
      checkExecution();
      if (!this.task.initialized) await this.task.initMeta(signal);
      const chapter = this.task.chapters.find(
        (ch) => ch.chapterId === chapterId,
      );
      if (!chapter) throw new Error(`章节 ${chapterId} 不存在`);
      title = chapter.title;
      tracker.onLog(`[${title}] 开始获取原文`);
      const context = {
        signal: signal ?? new AbortController().signal,
        canUpload: this.canUpdateProvider,
        onLog: tracker.onLog,
      };
      checkExecution();
      const detail = await this.task.fetchChapter(chapterId, context);
      checkExecution();

      // 单个段落内的换行不是段落分隔符，拼接前清理，避免译文错位。
      const paragraphs = detail.paragraphs.map((line) =>
        line.replace(/[\r\n]/g, ''),
      );
      const history =
        this.task.level !== 'all' && detail.oldParagraphZh
          ? {
              lines: paragraphs,
              translatedLines: detail.oldParagraphZh,
              glossary: detail.oldGlossary ?? {},
            }
          : undefined;
      tracker.onChapterStatus(chapterId, 'translating');
      tracker.onLog(`[${title}] 开始翻译`);

      return {
        lines: paragraphs,
        glossary: detail.glossary,
        history,
        tracker: tracker.segmentTracker,
        onComplete: async (result) => {
          checkExecution();
          if (result.failed.length > 0) {
            markChapterError();
            tracker.onLog(
              `[${title}] ⚠️ ${result.failed.length} 个分段翻译失败，已回退为原文`,
            );
            return;
          }

          await this.task.uploadChapter(
            chapterId,
            detail.glossaryId,
            result.lines,
            context,
          );
          // 上传成功后即使立即停止也视为完成，避免重复抓取和上传。
          tracker.onChapterStatus(chapterId, 'done');
          updateProgress();
          tracker.onLog(`[${title}] ✅ 完成`);
        },
        onError,
        onAbort: markChapterPending,
      };
    } catch (error) {
      onError(error);
      return undefined;
    }
  }
}
