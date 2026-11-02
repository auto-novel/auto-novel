import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';
import type {
  TranslateTaskParams,
  TranslatorId,
  WenkuTranslateTask,
} from '@/model/Translator';
import type {
  ChapterDetail,
  TaskExecutionContext,
  TranslationTask,
} from './types';
import { WenkuNovelApi } from '@/api';
import { buildChapterMetaList } from './utils';

export class WenkuTranslationTask implements TranslationTask {
  readonly type = 'wenku' as const;
  readonly description: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  chapters: ChapterMeta[] = [];
  glossary: Glossary = {};
  glossaryId = '';
  initialized = false;

  private params: TranslateTaskParams;

  constructor(
    private novelId: string,
    private volumeId: string,
    private translatorId: TranslatorId,
    params: TranslateTaskParams,
  ) {
    this.description = `wenku/${novelId}/${volumeId}`;
    this.level = params.level;
    this.params = params;
  }

  async initMeta(signal?: AbortSignal): Promise<void> {
    const task = await this.createApi(signal).getTranslateTask();
    signal?.throwIfAborted();
    this.glossary = {};
    this.glossaryId = task.glossaryId;

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: WenkuTranslateTask['toc'][number]) =>
      item.glossaryId !== undefined;
    const isExpired = (item: WenkuTranslateTask['toc'][number]) =>
      item.glossaryId !== undefined && item.glossaryId !== task.glossaryId;
    const toMeta = (
      item: WenkuTranslateTask['toc'][number],
      _order: number,
    ) => ({
      chapterId: item.chapterId,
      title: item.chapterId,
    });

    this.chapters = buildChapterMetaList(
      task.toc.slice(startIndex, endIndex),
      startIndex,
      level,
      isDone,
      isExpired,
      toMeta,
    );
    this.initialized = true;
  }

  async fetchChapter(
    chapterId: string,
    context?: TaskExecutionContext,
  ): Promise<ChapterDetail> {
    this.checkExecution(context);
    const api = this.createApi(context?.signal);
    const chapterTask = await api.getChapterTranslateTask(chapterId);
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

  private checkExecution(context?: TaskExecutionContext): void {
    context?.signal.throwIfAborted();
    if (context?.canCommit?.() === false) {
      throw new DOMException('任务已停止或失效', 'AbortError');
    }
  }

  private createApi(signal?: AbortSignal) {
    // API 捕获信号，仅供当前请求使用，不能沿用初始化或上一轮执行的信号。
    return WenkuNovelApi.createTranslationApi(
      this.novelId,
      this.volumeId,
      this.translatorId,
      signal,
    );
  }
}
