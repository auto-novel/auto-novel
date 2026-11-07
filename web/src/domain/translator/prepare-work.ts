import type { TranslationWork } from '@auto-novel/translator';
import type { UnitState, UnitStatus, UnitDetailState } from './task-state';
import type {
  ChapterSaveResult,
  TranslationTask,
  TranslationUnitRef,
} from './tasks/task';

export type UnitTracker = {
  onUnitStatus: (chapterId: string, status: UnitStatus) => void;
  onLog: (msg: string) => void;
  segmentTracker?: UnitDetailState;
  onChapterSaved?: (counts: ChapterSaveResult) => void;
};

/** 取消等待不支持 signal 的底层调用；仍接住其迟到结果。 */
function awaitWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

export class WorkPreparer {
  private readonly preparationTimeoutMs: number;

  constructor(
    private task: TranslationTask,
    options: { preparationTimeoutMs?: number } = {},
  ) {
    this.preparationTimeoutMs = options.preparationTimeoutMs ?? 120_000;
    if (
      !Number.isFinite(this.preparationTimeoutMs) ||
      this.preparationTimeoutMs <= 0
    ) {
      throw new RangeError('原文准备超时必须为正数');
    }
  }

  /** 获取翻译单元；翻译与保存回调统一交给流水线。零行单元直接保存。 */
  async prepareUnit(
    unit: UnitState,
    tracker: UnitTracker,
    signal: AbortSignal,
  ): Promise<TranslationWork | undefined> {
    const isMetadata = unit.kind === 'metadata';
    const chapterId = unit.chapterId;
    const title = unit.title;
    // 单元信号贯穿准备与保存，结算前持续转发父取消；仅准备阶段设置超时。
    const unitController = new AbortController();
    const unitSignal = unitController.signal;
    const abortUnit = () => unitController.abort(signal.reason);
    const releaseUnit = () => signal.removeEventListener('abort', abortUnit);
    let handedOff = false;
    const setStatus = (status: UnitStatus) =>
      tracker.onUnitStatus(chapterId, status);
    const markError = () => setStatus('error');
    const markPending = () => setStatus('pending');
    const onError = (error: unknown) => {
      releaseUnit();
      if (
        signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        markPending();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = message;
      markError();
      tracker.onLog(`[${title}] ❌ 失败: ${message}`);
    };
    if (tracker.segmentTracker) tracker.segmentTracker.errorMessage = undefined;

    try {
      signal.throwIfAborted();
      if (!this.task.initialized) throw new Error('翻译任务尚未初始化');
      const context = {
        signal: unitSignal,
        onLog: (message: string) => {
          if (!unitSignal.aborted) tracker.onLog(message);
        },
      };
      const ref: TranslationUnitRef = isMetadata
        ? { kind: 'metadata' }
        : { kind: 'chapter', chapterId };
      if (ref.kind === 'metadata') {
        if (!this.task.metadataUnit)
          throw new Error('元数据单元不存在或已失效');
      } else if (
        !this.task.chapters.some(
          (chapter) => chapter.chapterId === ref.chapterId,
        )
      ) {
        throw new Error(`章节 ${chapterId} 不存在或已失效`);
      }
      tracker.onLog(`[${title}] 开始获取原文`);
      signal.addEventListener('abort', abortUnit, { once: true });
      if (signal.aborted) abortUnit();
      const timer = setTimeout(() => {
        unitController.abort(
          new DOMException(
            `获取原文超时（${this.preparationTimeoutMs / 1000} 秒），请重试`,
            'TimeoutError',
          ),
        );
      }, this.preparationTimeoutMs);
      let prepared: Awaited<ReturnType<TranslationTask['prepareUnit']>>;
      try {
        prepared = await awaitWithSignal(
          this.task.prepareUnit(ref, context),
          unitSignal,
        );
        unitSignal.throwIfAborted();
      } finally {
        // 超时仅覆盖原文准备，不限制后续翻译和保存耗时。
        clearTimeout(timer);
      }
      signal.throwIfAborted();
      setStatus('translating');
      const save = async (lines: readonly string[]) => {
        signal.throwIfAborted();
        if (lines.length !== prepared.lines.length)
          throw new Error('翻译结果数量不匹配');
        const counts = await prepared.save(lines);
        // 保存成功后即使立即停止也视为完成，避免重复上传。
        setStatus('done');
        if (!isMetadata && counts) tracker.onChapterSaved?.(counts);
        tracker.onLog(`[${title}] ✅ 完成`);
      };
      if (prepared.lines.length === 0) {
        tracker.segmentTracker?.onSegmentsReady([]);
        await save([]);
        return undefined;
      }
      tracker.onLog(`[${title}] 开始翻译`);
      handedOff = true;
      return {
        trustedOnly: this.task.type !== 'local',
        lines: prepared.lines,
        glossary: prepared.glossary,
        history: prepared.history,
        tracker: tracker.segmentTracker,
        onComplete: async (result) => {
          try {
            signal.throwIfAborted();
            if (result.failed.length > 0) {
              markError();
              tracker.onLog(
                `[${title}] ⚠️ ${result.failed.length} 个分段翻译失败，已回退为原文`,
              );
              return;
            }
            await save(result.lines);
          } finally {
            releaseUnit();
          }
        },
        onError,
        onAbort: () => {
          abortUnit();
          releaseUnit();
          markPending();
        },
      };
    } catch (error) {
      onError(error);
      return undefined;
    } finally {
      if (!handedOff) releaseUnit();
    }
  }
}
