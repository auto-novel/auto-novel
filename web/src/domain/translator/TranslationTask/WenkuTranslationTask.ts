import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta, ChapterContent } from '../TaskState';
import type {
  TranslatorId,
  TranslateTaskParams,
  WenkuTranslateTask,
} from '@/model/Translator';
import type { TranslationTask } from './types';
import { WenkuNovelApi } from '@/api';
import { buildChapterMetaList } from './utils';

export class WenkuTranslationTask implements TranslationTask {
  readonly type = 'wenku' as const;
  readonly description: string;
  chapters: ChapterMeta[] = [];
  glossary: Glossary = {};
  glossaryId = '';

  private api!: ReturnType<typeof WenkuNovelApi.createTranslationApi>;
  private params: TranslateTaskParams;

  constructor(
    private novelId: string,
    private volumeId: string,
    private translatorId: 'gpt',
    params: TranslateTaskParams,
  ) {
    this.description = `wenku/${novelId}/${volumeId}`;
    this.params = params;
  }

  async initMeta(signal?: AbortSignal): Promise<void> {
    this.api = WenkuNovelApi.createTranslationApi(
      this.novelId,
      this.volumeId,
      this.translatorId as TranslatorId,
      signal,
    );

    const task = await this.api.getTranslateTask();
    this.glossary = {};
    this.glossaryId = task.glossaryId;

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: WenkuTranslateTask['toc'][number]) =>
      item.glossaryId !== undefined;
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
