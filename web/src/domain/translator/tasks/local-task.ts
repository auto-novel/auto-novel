import type { Glossary } from '@auto-novel/translator';
import { createGlossarySample, readAutoGlossary } from '@auto-novel/translator';
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

export interface LocalTaskOptions {
  autoGlossary?: () => boolean;
  writeAutoGlossary?: () => boolean;
}

export class LocalTranslationTask implements TranslationTask {
  readonly type = 'local' as const;
  private readonly level: TranslateTaskParams['level'];
  chapters: readonly TaskChapter[] = [];
  private glossary: Glossary = {};
  private glossaryId = '';
  initialized = false;
  private volumeStore!: LocalVolumeStore;
  private storeLoaded = false;
  preparing = false;
  private glossaryAnalyzed = false;
  private generatedGlossary: Glossary = {};

  constructor(
    private volumeId: string,
    private translatorId: TranslatorId,
    private params: TranslateTaskParams,
    private options: LocalTaskOptions = {},
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
    const enabled = () =>
      this.translatorId === 'gpt' && this.options.autoGlossary?.() === true;
    if (
      enabled() &&
      !this.glossaryAnalyzed &&
      Object.keys(this.glossary).length === 0
    ) {
      const sample = createGlossarySample(chapter.paragraphs);
      if (sample.length > 0) {
        this.preparing = true;
        return {
          lines: [JSON.stringify(sample)],
          glossary: {},
          purpose: 'glossary',
          save: async (translated) => {
            context.signal.throwIfAborted();
            if (!enabled()) return;
            this.generatedGlossary = readAutoGlossary(translated[0], sample);
            context.onLog(
              `术语分析完成：保留${Object.keys(this.generatedGlossary).length}个关键术语`,
            );
            if (
              this.options.writeAutoGlossary?.() === false ||
              Object.keys(this.generatedGlossary).length === 0
            )
              return;
            try {
              const { metadata, written } =
                await this.volumeStore.initializeGlossary(
                  this.volumeId,
                  { ...this.generatedGlossary },
                  () => {
                    context.signal.throwIfAborted();
                    if (
                      !enabled() ||
                      this.options.writeAutoGlossary?.() === false
                    )
                      throw new DOMException('自动写入已关闭', 'AbortError');
                  },
                );
              if (!metadata) throw new Error('小说不存在');
              this.glossary = metadata.glossary ?? {};
              this.glossaryId = metadata.glossaryId ?? '';
              context.onLog(
                written
                  ? '关键术语已写入空的本地术语表'
                  : Object.keys(this.glossary).length > 0
                    ? '使用已有的本地术语表'
                    : '保留已有译文的术语版本，本次使用临时术语',
              );
            } catch (error) {
              context.signal.throwIfAborted();
              context.onLog(`本地术语表写入跳过：${String(error)}`);
            }
          },
          finalize: (cancelled) => {
            this.preparing = false;
            this.glossaryAnalyzed = !cancelled;
          },
        };
      }
      this.glossaryAnalyzed = true;
    }
    const oldTranslation = chapter[this.translatorId];
    const glossary =
      enabled() && Object.keys(this.glossary).length === 0
        ? this.generatedGlossary
        : this.glossary;
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
