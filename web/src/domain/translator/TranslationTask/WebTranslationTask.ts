import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';
import type {
  TranslateTaskParams,
  WebTranslateTask,
  TranslatorId,
} from '@/model/Translator';
import type {
  ChapterDetail,
  TaskExecutionContext,
  TranslationTask,
} from './types';
import { WebNovelApi, formatError } from '@/api';
import { CrawlerService } from '@/domain/crawler';
import { createWebMetadataCoder } from '@/domain/translate/WebMetadataCoder';
import { buildChapterMetaList } from './utils';

export class WebTranslationTask implements TranslationTask {
  readonly type = 'web' as const;
  readonly description: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  chapters: ChapterMeta[] = [];
  glossary: Glossary = {};
  glossaryId = '';
  initialized = false;

  private params: TranslateTaskParams;
  private task?: WebTranslateTask;
  private initialization?: Promise<void>;
  private prepared = false;

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

  initMeta(signal?: AbortSignal): Promise<void> {
    this.initialization ??= this.loadMeta(signal).finally(() => {
      this.initialization = undefined;
    });
    return this.initialization;
  }

  private async loadMeta(signal?: AbortSignal): Promise<void> {
    const api = this.createApi(signal);
    const task = await api.getTranslateTask();
    signal?.throwIfAborted();
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
    this.initialized = true;
  }

  get needsPreparation(): boolean {
    return this.params.useBrowserCrawler && !this.prepared;
  }

  async prepareExecution(context: TaskExecutionContext): Promise<void> {
    if (!this.needsPreparation) return;
    // 预览可能正在初始化，先等待读取完成，再刷新目录和任务快照。
    if (this.initialization) await this.initialization;
    this.checkExecution(context);
    try {
      context.onLog('获取小说信息');
      const novel = await WebNovelApi.getNovel(this.providerId, this.novelId);
      this.checkExecution(context);
      context.onLog('通过浏览器爬虫更新目录');
      await CrawlerService.updateWebNovel(
        this.providerId,
        this.novelId,
        novel,
        {
          safeUpdateToc: this.level !== 'sync',
          signal: context.signal,
          canUpdate: context.canUpload,
        },
      );
      context.onLog('目录已更新');
    } catch (error) {
      this.checkExecution(context);
      if (error instanceof DOMException && error.name === 'AbortError')
        throw error;
      context.onLog(`目录更新跳过：${await formatError(error)}`);
    }
    this.checkExecution(context);
    // 抓取期间预览可能发起旧快照读取，不应该将其复用为更新后的目录。
    if (this.initialization) await this.initialization;
    this.checkExecution(context);
    await this.initMeta(context.signal);
    this.checkExecution(context);
    this.prepared = true;
  }

  private checkExecution(context?: TaskExecutionContext): void {
    context?.signal.throwIfAborted();
    if (context?.canUpload?.() === false) {
      throw new DOMException('任务已停止或不允许上传', 'AbortError');
    }
  }

  get needsMetadata(): boolean {
    return (
      this.initialized &&
      this.translatorId !== 'gpt' &&
      this.task !== undefined &&
      createWebMetadataCoder(this.task, this.params.forceMetadata).needUpload
    );
  }

  /** 翻译标题、简介和目录，与旧版工作区一致 */
  async translateMetadata(
    translate: (texts: string[]) => Promise<string[]>,
    signal?: AbortSignal,
    canUpload?: () => boolean,
  ): Promise<void> {
    if (!this.needsMetadata || !this.task) return;
    const coder = createWebMetadataCoder(this.task, this.params.forceMetadata);
    const checkUpload = () => {
      signal?.throwIfAborted();
      if (canUpload?.() === false) {
        throw new Error('存在未通过上传检查的翻译器，无法启动网络／文库任务');
      }
    };
    checkUpload();
    const translated =
      coder.encoded.length === 0 ? [] : await translate(coder.encoded);
    checkUpload();
    if (translated.length !== coder.encoded.length) {
      throw new Error('元数据翻译结果数量不匹配');
    }
    // initMeta 的请求可能早于本轮运行，上传必须绑定本轮的取消信号。
    const api = this.createApi(signal);
    await api.updateMetadataTranslation(coder.recover(translated));
  }

  async fetchChapter(
    chapterId: string,
    context?: TaskExecutionContext,
  ): Promise<ChapterDetail> {
    this.checkExecution(context);
    let syncFromProvider = this.level === 'sync';
    if (context && this.params.useBrowserCrawler) {
      try {
        context.onLog('通过浏览器爬虫更新章节');
        const action = await CrawlerService.updateWebNovelChapter(
          this.providerId,
          this.novelId,
          chapterId,
          syncFromProvider,
          { signal: context.signal, canUpdate: context.canUpload },
        );
        context.onLog(action === 'created' ? '章节已创建' : '章节已更新');
        syncFromProvider = false;
      } catch (error) {
        this.checkExecution(context);
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        context.onLog(`章节更新跳过：${await formatError(error)}`);
      }
    }
    this.checkExecution(context);
    const api = this.createApi(context?.signal);
    const chapterTask = await api.getChapterTranslateTask(chapterId, {
      syncFromProvider,
    });
    this.checkExecution(context);
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
    this.checkExecution(context);
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
