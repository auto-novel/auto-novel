import { TranslationPipeline } from '@auto-novel/translator';
import type { ChapterStatus, ChapterSegmentState } from './TaskState';
import type { TranslationTask } from './TranslationTask/types';

export type ChapterTracker = {
  onChapterStatus: (chapterId: string, status: ChapterStatus) => void;
  onProgress: (finished: number, error: number, total: number) => void;
  onLog: (msg: string) => void;
  segmentTracker?: ChapterSegmentState;
};

export class TaskExecutor {
  private _initialized = false;

  constructor(
    private task: TranslationTask,
    private pipeline: TranslationPipeline,
  ) {}

  /**
   * fetch → translate → upload。
   */
  async executeChapter(
    chapterId: string,
    tracker: ChapterTracker,
    signal?: AbortSignal,
  ): Promise<'success' | 'error' | 'abort'> {
    if (!this._initialized) {
      await this.task.initMeta(signal);
      this._initialized = true;
    }

    const chapters = this.task.chapters;
    const chapter = chapters.find((ch) => ch.chapterId === chapterId);
    if (!chapter) throw new Error(`章节 ${chapterId} 不存在`);

    tracker.onLog(`[${chapter.title}] 开始获取原文`);

    try {
      const detail = await this.task.fetchChapter(chapterId);
      if (signal?.aborted) {
        tracker.onChapterStatus(chapterId, 'pending');
        return 'abort';
      }

      tracker.onChapterStatus(chapterId, 'translating');
      tracker.onLog(`[${chapter.title}] 开始翻译`);

      const original = detail.paragraphs.join('\n');
      const history =
        this.task.level !== 'all' && detail.oldParagraphZh
          ? {
              lines: detail.paragraphs,
              translatedLines: detail.oldParagraphZh,
              glossary: detail.oldGlossary ?? {},
            }
          : undefined;
      const translated = await this.pipeline.translate(
        original,
        detail.glossary,
        history,
        signal,
        tracker.segmentTracker,
      );

      if (signal?.aborted) {
        tracker.onChapterStatus(chapterId, 'pending');
        return 'abort';
      }

      if (tracker.segmentTracker && tracker.segmentTracker.errorCount > 0) {
        tracker.onChapterStatus(chapterId, 'error');
        const finished = chapters.filter((ch) => ch.status === 'done').length;
        const errors = chapters.filter((ch) => ch.status === 'error').length;
        tracker.onProgress(finished, errors, chapters.length);
        tracker.onLog(
          `[${chapter.title}] ⚠️ ${tracker.segmentTracker.errorCount} 个分段翻译失败，已回退为原文`,
        );
        return 'error';
      }

      await this.task.uploadChapter(
        chapterId,
        detail.glossaryId,
        translated.split('\n'),
      );

      tracker.onChapterStatus(chapterId, 'done');
      const finished = chapters.filter((ch) => ch.status === 'done').length;
      const errors = chapters.filter((ch) => ch.status === 'error').length;
      tracker.onProgress(finished, errors, chapters.length);
      tracker.onLog(`[${chapter.title}] ✅ 完成`);
      return 'success';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        tracker.onChapterStatus(chapterId, 'pending');
        return 'abort';
      }
      tracker.onChapterStatus(chapterId, 'error');
      const finished = chapters.filter((ch) => ch.status === 'done').length;
      const errors = chapters.filter((ch) => ch.status === 'error').length;
      tracker.onProgress(finished, errors, chapters.length);
      tracker.onLog(`[${chapter.title}] ❌ 失败: ${err.message ?? err}`);
      return 'error';
    }
  }
}
