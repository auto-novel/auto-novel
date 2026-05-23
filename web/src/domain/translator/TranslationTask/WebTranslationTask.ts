import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';
import type { TranslateTaskParams, WebTranslateTask } from '@/model/Translator';
import type { ChapterDetail, TranslationTask } from './types';
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
      this.translatorId,
      this.params.level === 'sync',
      signal,
    );

    const task = await this.api.getTranslateTask();
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
  }

  async fetchChapter(chapterId: string): Promise<ChapterDetail> {
    const chapterTask = await this.api.getChapterTranslateTask(chapterId);
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
  ): Promise<void> {
    await this.api.updateChapterTranslation(chapterId, {
      glossaryId,
      paragraphsZh: translatedParagraphs,
    });
  }
}
