import type { TranslationPipeline, Semaphore } from '@auto-novel/translator';
import type { ChapterStatus, ChapterSegmentState } from './TaskState';
import type { ChapterDetail, TranslationTask } from './TranslationTask/types';

export type ChapterTracker = {
  onChapterStatus: (chapterId: string, status: ChapterStatus) => void;
  onProgress: (finished: number, error: number, total: number) => void;
  onLog: (msg: string) => void;
  segmentTracker?: ChapterSegmentState;
};

/**
 * 章节级翻译函数：比 TranslationPipeline 更轻量的接入方式。
 * 输入整章详情，返回与 detail.paragraphs 一一对应的译文数组；
 * 失败时直接抛错，由 executeChapter 统一按章节错误处理。
 */
export type ChapterTranslator = (
  detail: ChapterDetail,
  tracker: ChapterTracker,
  signal?: AbortSignal,
) => Promise<string[]>;

export class TaskExecutor {
  constructor(
    private task: TranslationTask,
    /** pipeline 模式传翻译管线；harness 模式传章节翻译函数 */
    private translator: TranslationPipeline | ChapterTranslator,
    private fetchSemaphore: Semaphore,
    private canUpload?: () => boolean,
  ) {}

  /**
   * fetch → translate → upload。
   */
  async executeChapter(
    chapterId: string,
    tracker: ChapterTracker,
    signal?: AbortSignal,
  ): Promise<'success' | 'error' | 'abort'> {
    if (!this.task.initialized) {
      await this.task.initMeta();
    }

    const chapters = this.task.chapters;
    const chapter = chapters.find((ch) => ch.chapterId === chapterId);
    if (!chapter) throw new Error(`章节 ${chapterId} 不存在`);

    if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = undefined;
    tracker.onLog(`[${chapter.title}] 开始获取原文`);

    try {
      const context = {
        signal: signal ?? new AbortController().signal,
        canUpload: this.canUpload,
        onLog: tracker.onLog,
      };
      if (this.task.type !== 'local' && this.canUpload?.() === false) {
        throw new Error('存在未通过上传检查的翻译器，无法启动网络／文库任务');
      }
      const checkExecution = () => {
        context.signal.throwIfAborted();
        if (this.canUpload?.() === false) {
          throw new DOMException('任务已失效或不允许上传', 'AbortError');
        }
      };
      const fetchAndPrepare = async () => {
        const translator = this.translator;
        // pipeline 内部有分块队列，先等它降到高水位以下再抓新章节，
        // 避免把整章原文一股脑推进内存；harness 是直接的函数调用，没有队列。
        if (typeof translator !== 'function') {
          await translator.waitUntilBelowHighWaterMark(signal);
        }
        checkExecution();
        const detail = await this.task.fetchChapter(chapterId, context);
        checkExecution();

        // 这里只负责“准备好怎么翻”，真正执行放在 fetch 信号量释放之后，
        // 否则长时间的模型请求会一直占着“同时抓取章节数”的名额。
        let translate: () => Promise<string[]>;
        if (typeof translator === 'function') {
          translate = () => translator(detail, tracker, signal);
        } else {
          const history =
            this.task.level !== 'all' && detail.oldParagraphZh
              ? {
                  lines: detail.paragraphs,
                  translatedLines: detail.oldParagraphZh,
                  glossary: detail.oldGlossary ?? {},
                }
              : undefined;
          // pipeline 模式：先把整章拆成分块并启动各分块任务，
          // 返回的函数只负责等待所有分块完成并拼回整章文本。
          const { segments, segmentPromises } = translator.prepareSegments(
            detail.paragraphs.join('\n'),
            detail.glossary,
            history,
            signal,
            tracker.segmentTracker,
          );
          translate = async () =>
            (
              await translator.resolveTranslation(
                segments,
                segmentPromises,
                signal,
                tracker.segmentTracker,
              )
            ).split('\n');
        }
        tracker.onChapterStatus(chapterId, 'translating');
        tracker.onLog(`[${chapter.title}] 开始翻译`);

        return { detail, translate };
      };
      const { detail, translate } = this.fetchSemaphore
        ? await this.fetchSemaphore.use(fetchAndPrepare)
        : await fetchAndPrepare();

      const translated = await translate();

      if (signal?.aborted) {
        tracker.onChapterStatus(chapterId, 'pending');
        return 'abort';
      }

      // pipeline 会把失败的分块记在 segmentTracker 里并用原文回退，
      // 所以这里需要单独检查；harness 没有分块概念，失败会直接抛错走 catch。
      if (
        typeof this.translator !== 'function' &&
        tracker.segmentTracker &&
        tracker.segmentTracker.errorCount > 0
      ) {
        tracker.onChapterStatus(chapterId, 'error');
        const finished = chapters.filter((ch) => ch.status === 'done').length;
        const errors = chapters.filter((ch) => ch.status === 'error').length;
        tracker.onProgress(finished, errors, chapters.length);
        tracker.onLog(
          `[${chapter.title}] ⚠️ ${tracker.segmentTracker.errorCount} 个分段翻译失败，已回退为原文`,
        );
        return 'error';
      }

      checkExecution();
      await this.task.uploadChapter(
        chapterId,
        detail.glossaryId,
        translated,
        context,
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
      const message = err?.message || String(err);
      if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = message;
      tracker.onChapterStatus(chapterId, 'error');
      const finished = chapters.filter((ch) => ch.status === 'done').length;
      const errors = chapters.filter((ch) => ch.status === 'error').length;
      tracker.onProgress(finished, errors, chapters.length);
      tracker.onLog(`[${chapter.title}] ❌ 失败: ${message}`);
      return 'error';
    }
  }
}
