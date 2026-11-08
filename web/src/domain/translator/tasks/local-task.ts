import type { Glossary } from '@auto-novel/translator';
import type { TranslatorId } from '@/model/Translator';
import type { TranslateTaskParams } from './task-descriptor';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import type {
  PreparedUnit,
  TaskExecutionContext,
  TranslationTask,
  TaskChapter,
  TranslationUnitRef,
} from './task';
import type { LocalVolumeStore } from '@/stores/local/LocalVolumeRepository';
import { useLocalVolumeStore } from '@/stores';
import { buildChapterList, prepareChapterInput } from './chapter-preparation';

export class LocalTranslationTask implements TranslationTask {
  readonly type = 'local' as const;
  private readonly level: TranslateTaskParams['level'];
  chapters: readonly TaskChapter[] = [];
  private glossary: Glossary = {};
  private glossaryId = '';
  initialized = false;
  private volumeStore!: LocalVolumeStore;
  private storeLoaded = false;

  constructor(
    private volumeId: string,
    private translatorId: TranslatorId,
    private params: TranslateTaskParams,
  ) {
    this.level = params.level;
  }

  private async _ensureStore(): Promise<void> {
    if (this.storeLoaded) return;
    this.volumeStore = await useLocalVolumeStore();
    this.storeLoaded = true;
  }

  async initialize({ signal }: TaskExecutionContext): Promise<void> {
    signal.throwIfAborted();
    if (this.initialized) return;
    await this._ensureStore();
    signal.throwIfAborted();
    const metadata = await this.volumeStore.getVolume(this.volumeId);
    signal.throwIfAborted();
    if (!metadata) throw new Error('小说不存在');

    this.glossary = metadata.glossary ?? {};
    this.glossaryId = metadata.glossaryId ?? '';

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: LocalVolumeMetadata['toc'][number]) =>
      item[this.translatorId] !== undefined;
    const isExpired = (item: LocalVolumeMetadata['toc'][number]) =>
      item[this.translatorId] !== undefined &&
      item[this.translatorId] !== metadata.glossaryId;
    const toMeta = (item: LocalVolumeMetadata['toc'][number]) => ({
      chapterId: item.chapterId,
      title: item.chapterId,
    });

    this.chapters = buildChapterList(
      metadata.toc.slice(startIndex, endIndex),
      startIndex,
      level,
      isDone,
      isExpired,
      toMeta,
    );
    this.initialized = true;
  }

  async prepareUnit(
    unit: TranslationUnitRef,
    context: TaskExecutionContext,
  ): Promise<PreparedUnit> {
    context.signal.throwIfAborted();
    if (unit.kind === 'metadata') throw new Error('本地任务不支持元数据单元');
    const chapterId = unit.chapterId;
    await this._ensureStore();
    context.signal.throwIfAborted();
    const chapter = await this.volumeStore.getChapter(this.volumeId, chapterId);
    context.signal.throwIfAborted();
    if (!chapter) throw new Error('章节不存在');
    const oldTranslation = chapter[this.translatorId];
    const glossary = this.glossary;
    const glossaryId = this.glossaryId;
    return {
      ...prepareChapterInput(
        chapter.paragraphs,
        glossary,
        this.level,
        oldTranslation?.paragraphs,
        oldTranslation?.glossary,
      ),
      save: async (translated) => {
        const checkExecution = () => context.signal.throwIfAborted();
        checkExecution();
        const zh = await this.volumeStore.updateTranslation(
          this.volumeId,
          chapterId,
          this.translatorId,
          { glossaryId, glossary, paragraphs: [...translated] },
          checkExecution,
        );
        return { zh };
      },
    };
  }
}
