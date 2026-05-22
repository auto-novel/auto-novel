import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta, ChapterContent } from '../TaskState';
import type {
  TranslatorId,
  TranslateTaskParams,
  WebTranslateTask,
} from '@/model/Translator';
import type { TranslationTask } from './types';
import { WebNovelApi } from '@/api';
import { buildChapterMetaList } from './utils';

export class WebTranslationTask implements TranslationTask {
  readonly type = 'web' as const;
  readonly description: string;
  chapters: ChapterMeta[] = [];
  glossary: Glossary = {};
  glossaryId = '';

  private api!: ReturnType<typeof WebNovelApi.createTranslationApi>;
  private params: TranslateTaskParams;

  constructor(
    private providerId: string,
    private novelId: string,
    private translatorId: 'gpt',
    params: TranslateTaskParams,
  ) {
    this.description = `web/${providerId}/${novelId}`;
    this.params = params;
  }

  async initMeta(signal?: AbortSignal): Promise<void> {
    this.api = WebNovelApi.createTranslationApi(
      this.providerId,
      this.novelId,
      this.translatorId as TranslatorId,
      this.params.level === 'sync',
      signal,
    );

    const task = await this.api.getTranslateTask();
    this.glossary = task.glossary;
    this.glossaryId = task.glossaryUuid;

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: WebTranslateTask['toc'][number]) =>
      item.glossaryUuid !== undefined;
    const toMeta = (item: WebTranslateTask['toc'][number], order: number) => ({
      chapterId: item.chapterId ?? `${order}`,
      title: item.titleJp,
    });

    this.chapters = buildChapterMetaList(
      task.toc.slice(startIndex, endIndex),
      startIndex,
      level,
      isDone,
      toMeta,
    );
  }

  async fetchChapter(chapterId: string): Promise<ChapterContent> {
    const chapterTask = await this.api.getChapterTranslateTask(chapterId);
    return {
      paragraphs: chapterTask.paragraphJp,
      glossary: chapterTask.glossary,
      glossaryId: chapterTask.glossaryId,
    };
  }

  async fetchTranslation(chapterId: string): Promise<string[] | null> {
    const chapterTask = await this.api.getChapterTranslateTask(chapterId);
    return chapterTask.oldParagraphZh ?? null;
  }

  async uploadChapter(
    chapterId: string,
    glossaryId: string,
    translatedParagraphs: string[],
  ): Promise<void> {
    await this.api.updateChapterTranslation(chapterId, {
      glossaryId,
      paragraphsZh: translatedParagraphs,
    });
  }
}
