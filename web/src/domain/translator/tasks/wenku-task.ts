import type {
  TranslateTaskParams,
  TranslatorId,
  WenkuTranslateTask,
} from '@/model/Translator';
import type {
  PreparedUnit,
  TaskExecutionContext,
  TranslationTask,
  TaskChapter,
  TranslationUnitRef,
} from './task';
import { WenkuNovelApi } from '@/api';
import { buildChapterList, prepareChapterInput } from './chapter-preparation';

export class WenkuTranslationTask implements TranslationTask {
  readonly type = 'wenku' as const;
  private readonly level: TranslateTaskParams['level'];
  chapters: readonly TaskChapter[] = [];
  initialized = false;

  private params: TranslateTaskParams;

  constructor(
    private novelId: string,
    private volumeId: string,
    private translatorId: TranslatorId,
    params: TranslateTaskParams,
  ) {
    this.level = params.level;
    this.params = params;
  }

  async initialize({ signal }: TaskExecutionContext): Promise<void> {
    signal.throwIfAborted();
    if (this.initialized) return;
    const task = await this.createApi(signal).getTranslateTask();
    signal.throwIfAborted();

    const { startIndex, endIndex, level } = this.params;

    const isDone = (item: WenkuTranslateTask['toc'][number]) =>
      item.glossaryId !== undefined;
    const isExpired = (item: WenkuTranslateTask['toc'][number]) =>
      item.glossaryId !== undefined && item.glossaryId !== task.glossaryId;
    const toMeta = (item: WenkuTranslateTask['toc'][number]) => ({
      chapterId: item.chapterId,
      title: item.chapterId,
    });

    this.chapters = buildChapterList(
      task.toc.slice(startIndex, endIndex),
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
    if (unit.kind === 'metadata') throw new Error('文库任务不支持元数据单元');
    const chapterId = unit.chapterId;
    const api = this.createApi(context.signal);
    const chapterTask = await api.getChapterTranslateTask(chapterId);
    context.signal.throwIfAborted();
    const glossaryId = chapterTask.glossaryId;
    return {
      ...prepareChapterInput(
        chapterTask.paragraphJp,
        chapterTask.glossary,
        this.level,
        chapterTask.oldParagraphZh,
        chapterTask.oldGlossary,
      ),
      save: async (translated) => {
        context.signal.throwIfAborted();
        await api.updateChapterTranslation(chapterId, {
          glossaryId,
          paragraphsZh: [...translated],
        });
      },
    };
  }

  private createApi(signal: AbortSignal) {
    // API 捕获信号，仅供当前请求使用，不能沿用初始化或上一轮执行的信号。
    return WenkuNovelApi.createTranslationApi(
      this.novelId,
      this.volumeId,
      this.translatorId,
      signal,
    );
  }
}
