import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';
import type {
  TranslateTaskParams,
  WebTranslateTask,
  TranslatorId,
} from '@/model/Translator';
import type {
  ChapterDetail,
  PreparedMetadata,
  TaskExecutionContext,
  TranslationTask,
} from './types';
import { WebNovelApi, formatError } from '@/api';
import { CrawlerService } from '@/domain/crawler';
import { createWebMetadataCoder } from '../WebMetadataCoder';
import { buildChapterMetaList } from './utils';

export class WebTranslationTask implements TranslationTask {
  readonly type = 'web' as const;
  readonly description: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  chapters: ChapterMeta[] = [];
  metadataUnit?: ChapterMeta;
  glossary: Glossary = {};
  glossaryId = '';
  initialized = false;

  private params: TranslateTaskParams;
  private task?: WebTranslateTask;

  constructor(
    private providerId: string,
    private novelId: string,
    private translatorId: TranslatorId,
    params: TranslateTaskParams,
  ) {
    this.description = `web/${providerId}/${novelId}`;
    this.level = params.level;
    this.params = params;
  }

  async initialize(context: TaskExecutionContext): Promise<void> {
    context.signal.throwIfAborted();
    if (this.initialized) return;
    if (this.params.useBrowserCrawler) await this.updateToc(context);
    await this.loadMeta(context.signal);
  }

  private async loadMeta(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const api = this.createApi(signal);
    const task = await api.getTranslateTask();
    signal.throwIfAborted();
    this.task = task;
    this.glossary = task.glossary;
    this.glossaryId = task.glossaryUuid;

    const { startIndex, endIndex, level } = this.params;

    const validToc = task.toc
      .filter((item) => item.chapterId !== undefined)
      .slice(startIndex, endIndex);

    const isDone = (item: WebTranslateTask['toc'][number]) =>
      item.glossaryUuid !== undefined;
    const isExpired = (item: WebTranslateTask['toc'][number]) =>
      item.glossaryUuid !== undefined &&
      item.glossaryUuid !== task.glossaryUuid;
    const toMeta = (item: WebTranslateTask['toc'][number], _order: number) => ({
      chapterId: item.chapterId!,
      title: item.titleJp,
    });

    this.chapters = buildChapterMetaList(
      validToc,
      startIndex,
      level,
      isDone,
      isExpired,
      toMeta,
    );
    this.metadataUnit =
      this.translatorId !== 'gpt' &&
      createWebMetadataCoder(task, this.params.forceMetadata).needUpload
        ? {
            // NUL 不会出现在合法远程章节 ID 中；分派仍只检查 kind。
            chapterId: '\u0000metadata',
            kind: 'metadata',
            title: '小说信息',
            order: -1,
            status: 'pending',
          }
        : undefined;
    this.initialized = true;
  }

  private async updateToc(context: TaskExecutionContext): Promise<void> {
    try {
      context.onLog('获取小说信息');
      const novel = await WebNovelApi.getNovel(this.providerId, this.novelId);
      context.signal.throwIfAborted();
      context.onLog('通过浏览器爬虫更新目录');
      await CrawlerService.updateWebNovel(
        this.providerId,
        this.novelId,
        novel,
        {
          safeUpdateToc: this.level !== 'sync',
          signal: context.signal,
        },
      );
      context.onLog('目录已更新');
    } catch (error) {
      context.signal.throwIfAborted();
      if (error instanceof DOMException && error.name === 'AbortError')
        throw error;
      context.onLog(`目录更新跳过：${await formatError(error)}`);
    }
    context.signal.throwIfAborted();
  }

  /** 编码与保存闭包绑定同一任务快照，上传使用本轮执行的取消信号。 */
  async prepareMetadata(
    context: TaskExecutionContext,
  ): Promise<PreparedMetadata> {
    context.signal.throwIfAborted();
    if (!this.metadataUnit || !this.task) throw new Error('没有待翻译的元数据');
    const coder = createWebMetadataCoder(this.task, this.params.forceMetadata);
    return {
      lines: coder.encoded,
      glossary: this.task.glossary,
      save: async (translated) => {
        context.signal.throwIfAborted();
        const metadata = coder.recover(translated);
        await this.createApi(context.signal).updateMetadataTranslation(
          metadata,
        );
      },
    };
  }

  async fetchChapter(
    chapterId: string,
    context?: TaskExecutionContext,
  ): Promise<ChapterDetail> {
    context?.signal.throwIfAborted();
    let syncFromProvider = this.level === 'sync';
    if (context && this.params.useBrowserCrawler) {
      try {
        context.onLog('通过浏览器爬虫更新章节');
        const action = await CrawlerService.updateWebNovelChapter(
          this.providerId,
          this.novelId,
          chapterId,
          syncFromProvider,
          { signal: context.signal },
        );
        context.onLog(action === 'created' ? '章节已创建' : '章节已更新');
        syncFromProvider = false;
      } catch (error) {
        context?.signal.throwIfAborted();
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        context.onLog(`章节更新跳过：${await formatError(error)}`);
      }
    }
    context?.signal.throwIfAborted();
    const api = this.createApi(context?.signal);
    const chapterTask = await api.getChapterTranslateTask(chapterId, {
      syncFromProvider,
    });
    context?.signal.throwIfAborted();
    return {
      paragraphs: chapterTask.paragraphJp,
      glossary: chapterTask.glossary,
      glossaryId: chapterTask.glossaryId,
      oldParagraphZh: chapterTask.oldParagraphZh ?? null,
      oldGlossary: chapterTask.oldGlossary,
    };
  }

  async uploadChapter(
    chapterId: string,
    glossaryId: string,
    translatedParagraphs: string[],
    context?: TaskExecutionContext,
  ): Promise<void> {
    context?.signal.throwIfAborted();
    const api = this.createApi(context?.signal);
    await api.updateChapterTranslation(chapterId, {
      glossaryId,
      paragraphsZh: translatedParagraphs,
    });
  }

  private createApi(signal?: AbortSignal) {
    return WebNovelApi.createTranslationApi(
      this.providerId,
      this.novelId,
      this.translatorId,
      this.level === 'sync',
      signal,
    );
  }
}
