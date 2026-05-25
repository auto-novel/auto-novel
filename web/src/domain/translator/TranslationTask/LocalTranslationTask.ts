import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';
import type { TranslateTaskParams } from '@/model/Translator';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import type { ChapterDetail, TranslationTask } from './types';
import type { LocalVolumeStore } from '@/stores/local/LocalVolumeRepository';
import { useLocalVolumeStore } from '@/stores';
import { buildChapterMetaList } from './utils';

export class LocalTranslationTask implements TranslationTask {
  readonly type = 'local' as const;
  readonly description: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  chapters: ChapterMeta[] = [];
  glossary: Glossary = {};
  glossaryId = '';
  initialized = false;
  private volumeStore!: LocalVolumeStore;
  private storeLoaded = false;

  constructor(
    private volumeId: string,
    private translatorId: 'gpt',
    private params: TranslateTaskParams,
  ) {
    this.description = `local/${volumeId}`;
    this.level = params.level;
  }

  private async _ensureStore(): Promise<void> {
    if (this.storeLoaded) return;
    this.volumeStore = await useLocalVolumeStore();
    this.storeLoaded = true;
  }

  async initMeta(_signal?: AbortSignal): Promise<void> {
    await this._ensureStore();
    const metadata = await this.volumeStore.getVolume(this.volumeId);
    if (!metadata) throw new Error('小说不存在');

    this.glossary = metadata.glossary ?? {};
    this.glossaryId = metadata.glossaryId ?? '';

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: LocalVolumeMetadata['toc'][number]) =>
      item[this.translatorId] !== undefined;
    const isExpired = (item: LocalVolumeMetadata['toc'][number]) =>
      item[this.translatorId] !== undefined &&
      item[this.translatorId] !== metadata.glossaryId;
    const toMeta = (
      item: LocalVolumeMetadata['toc'][number],
      _order: number,
    ) => ({
      chapterId: item.chapterId,
      title: item.chapterId,
    });

    this.chapters = buildChapterMetaList(
      metadata.toc.slice(startIndex, endIndex),
      startIndex,
      level,
      isDone,
      isExpired,
      toMeta,
    );
    this.initialized = true;
  }

  async fetchChapter(chapterId: string): Promise<ChapterDetail> {
    await this._ensureStore();
    const chapter = await this.volumeStore.getChapter(this.volumeId, chapterId);
    if (!chapter) throw new Error('章节不存在');
    const oldTranslation = chapter[this.translatorId];
    return {
      paragraphs: chapter.paragraphs,
      glossary: this.glossary,
      glossaryId: this.glossaryId,
      oldParagraphZh: oldTranslation?.paragraphs ?? null,
      oldGlossary: oldTranslation?.glossary,
    };
  }

  async uploadChapter(
    chapterId: string,
    glossaryId: string,
    translatedParagraphs: string[],
  ): Promise<void> {
    await this._ensureStore();
    await this.volumeStore.updateTranslation(
      this.volumeId,
      chapterId,
      this.translatorId,
      {
        glossaryId,
        glossary: this.glossary,
        paragraphs: translatedParagraphs,
      },
    );
  }
}
