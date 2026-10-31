import { createLineSegmenter, assembleSegments } from './segment';
import { SegmentQueue, type SegmentTask } from './queue';
import type {
  LineSegmenter,
  TranslationInput,
  TranslationResult,
  TranslationWork,
  Translator,
  SegmentCache,
  TranslatorOptions,
} from '@/types';
import { Semaphore, anySignal, randomUUID } from '@/utils';
import {
  mergeTranslatedLines,
  splitPassthroughLines,
  postprocessTranslationLines,
} from './lines';
import { attemptTranslation } from './attempt';

interface TranslationLoop {
  id: string;
  translator: Translator;
  abortController: AbortController;
  /** 并发数，缺省为 1。 */
  concurrency?: number;
  /** 能否向该循环派发任务；缺省视为允许。 */
  approved?: () => boolean;
}

/** 一个输入切分后的任务与整体结果。 */
type PreparedInput = {
  tasks: SegmentTask[];
  result: Promise<TranslationResult>;
};

/** 已切分并入队的输入：`enqueued` 只代表投递完成，`result` 才是结算。 */
type StartedInput = {
  enqueued: Promise<void>;
  result: Promise<TranslationResult>;
  signal: AbortSignal;
};

export class TranslationPipeline {
  private readonly queue: SegmentQueue;
  private readonly translatorLoops: Map<string, TranslationLoop>;
  private readonly segmenter: LineSegmenter;
  private readonly cache?: SegmentCache;
  /** 当前生命周期；dispose 时取消所有未完成输入，之后换成新的。 */
  private lifecycle = new AbortController();
  /** 等待“获批”状态变化的消费者；refreshApproval 时唤醒重新判定。 */
  private readonly approvalWaiters: Array<() => void> = [];
  /** 已投递但尚未结算的输入；drain 等待它们并把回调错误上抛。 */
  private readonly pendingSettlements = new Set<Promise<void>>();
  private settlementError: unknown;

  /**
   * 队列水位始终跟随已注册翻译器的总并发（auto）；构造时尚未注册翻译器，
   * 因此从 1 开始，注册后由 _updateHighWaterMark 上调。
   */
  constructor(
    options: { segmenter?: LineSegmenter; cache?: SegmentCache } = {},
  ) {
    this.translatorLoops = new Map();
    this.queue = new SegmentQueue();
    this.segmenter = options.segmenter ?? createLineSegmenter(1500, 30);
    this.cache = options.cache;
  }

  /** 翻译一篇原文；返回回退后的译文行与失败分段，取消时抛 AbortError。 */
  async translate(
    input: TranslationInput,
    signal?: AbortSignal,
  ): Promise<TranslationResult> {
    const { enqueued, result } = this.start(input, signal);
    await enqueued;
    return result;
  }

  /**
   * 唯一投递路径：切分并入队。
   * `translate` 等到结算返回；`submit` 只等投递完成。
   */
  private start(input: TranslationInput, signal?: AbortSignal): StartedInput {
    // dispose 也要能取消未完成的输入，避免入队被背压卡住或结算悬空。
    const inputSignal =
      anySignal([signal, this.lifecycle.signal]) ?? this.lifecycle.signal;
    // 同步准备错误也进入结果通道，由同一处负责结算回调。
    const prepared = Promise.resolve().then(() =>
      this.prepareInput(input, inputSignal),
    );
    const enqueued = prepared.then(({ tasks }) =>
      this.queue.enqueueAll(tasks, inputSignal),
    );
    // 投递失败同样是输入失败，不能只等待分段结果而悬空。
    const result = Promise.all([
      enqueued,
      prepared.then(({ result }) => result),
    ]).then(([, result]) => result);
    // translate 可能仍在等待入队，提前接住结果的拒绝。
    void result.catch(() => {});
    return { enqueued, result, signal: inputSignal };
  }

  /**
   * 投递一个输入：切分并入队后立即返回（队列满时在这里等待）。
   * 结算仍走 `work` 的 onComplete/onError/onAbort；收尾用 `drain()` 等待全部结算。
   */
  async submit(work: TranslationWork, signal?: AbortSignal): Promise<void> {
    const {
      enqueued,
      settled,
      signal: inputSignal,
    } = this.dispatch(work, signal);
    this.track(settled, inputSignal);
    try {
      await enqueued;
    } catch {
      // 回调只走结算通道；投递路径只负责把取消继续上抛。
      inputSignal.throwIfAborted();
    }
  }

  /** 等待已投递输入全部结算；结算回调抛错时在这里上抛。 */
  async drain(): Promise<void> {
    while (this.pendingSettlements.size > 0) {
      await Promise.all([...this.pendingSettlements]);
    }
    const error = this.settlementError;
    this.settlementError = undefined;
    if (error !== undefined) throw error;
  }

  /** 切分 + 入队，并把结算接到输入的三个回调上。 */
  private dispatch(
    work: TranslationWork,
    signal?: AbortSignal,
  ): { enqueued: Promise<void>; settled: Promise<void>; signal: AbortSignal } {
    const { enqueued, result, signal: inputSignal } = this.start(work, signal);
    const settled = result
      .then((translated) => {
        inputSignal.throwIfAborted();
        return work.onComplete(translated);
      })
      .catch((error: unknown) =>
        inputSignal.aborted ? work.onAbort() : work.onError(error),
      );
    return { enqueued, settled, signal: inputSignal };
  }

  private track(settled: Promise<void>, signal?: AbortSignal): void {
    const entry = settled
      .catch((error: unknown) => {
        // 取消不算结算失败；其余错误留给 drain 上抛。
        if (!signal?.aborted) this.settlementError = error;
      })
      .finally(() => this.pendingSettlements.delete(entry));
    this.pendingSettlements.add(entry);
  }

  private prepareInput(
    input: TranslationInput,
    signal?: AbortSignal,
  ): PreparedInput {
    signal?.throwIfAborted();
    const { lines, glossary, history, tracker } = input;
    const ranges = this.segmenter.segment(lines);
    const segments = assembleSegments(
      randomUUID(),
      lines,
      ranges,
      glossary ?? {},
      history,
    );
    tracker?.onSegmentsReady?.(segments);
    // 取消后不再向调用方转发分段事件，避免把取消记成分段失败。
    const observer: SegmentTask['observer'] = {
      start: (segment, translatorId) => {
        if (!signal?.aborted)
          tracker?.onSegStart?.(segment.order, translatorId);
      },
      complete: (segment, translatedLines) => {
        if (!signal?.aborted)
          tracker?.onSegComplete?.(segment.order, translatedLines);
      },
      error: (segment, error) => {
        if (!signal?.aborted) tracker?.onSegError?.(segment.order, error);
      },
    };
    const tasks: SegmentTask[] = [];
    const promises = segments.map(
      (segment) =>
        new Promise<string[]>((resolve, reject) => {
          tasks.push({
            segment,
            observer,
            signal,
            resolve,
            reject,
          });
        }),
    );
    const onAbort = () => {
      this.queue.removeQueued(tasks);
      for (const task of tasks) task.reject(signal?.reason);
      tracker?.onAbort?.();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const result = Promise.allSettled(promises)
      .then((results) => {
        signal?.throwIfAborted();
        const failed: TranslationResult['failed'] = [];
        const mergedLines: string[] = [];
        results.forEach((settled, index) => {
          if (settled.status === 'fulfilled') {
            mergedLines.push(...settled.value);
            return;
          }
          failed.push({ order: segments[index].order, error: settled.reason });
          mergedLines.push(...segments[index].lines);
        });
        return { lines: mergedLines, failed };
      })
      .finally(() => signal?.removeEventListener('abort', onAbort));
    return { tasks, result };
  }

  /** 注册一个翻译器循环；同 id 的旧循环会被停止。 */
  registerTranslator(
    translator: Translator,
    options: TranslatorOptions = {},
  ): string {
    const configuredConcurrency = options.concurrency ?? 1;
    if (!Number.isInteger(configuredConcurrency) || configuredConcurrency < 1) {
      throw new RangeError('Translator concurrency must be a positive integer');
    }
    const id = options.id ?? randomUUID();
    this.translatorLoops.get(id)?.abortController.abort();
    const loop: TranslationLoop = {
      id,
      translator,
      abortController: new AbortController(),
      concurrency: configuredConcurrency,
      approved: options.approved,
    };
    this.translatorLoops.set(id, loop);
    this._updateHighWaterMark();
    this._startLoop(loop, options.onActiveCountChange);
    return id;
  }

  /**
   * 审批状态可能变化后调用：唤醒等待获批的消费者。
   * 未获批的循环不接任务，任务留在队列里等待而不是判失败。
   */
  refreshApproval(): void {
    for (const wake of this.approvalWaiters.splice(0)) wake();
  }

  private isApproved(loop: TranslationLoop): boolean {
    if (!loop.approved) return true;
    try {
      return loop.approved();
    } catch {
      // 判定本身出错时按“不可用”处理，避免把内容发给未确认的端点。
      return false;
    }
  }

  private async waitUntilApproved(loop: TranslationLoop): Promise<void> {
    const signal = loop.abortController.signal;
    while (!this.isApproved(loop)) {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          cleanup();
          resolve();
        };
        const onAbort = () => {
          cleanup();
          reject(signal.reason);
        };
        const cleanup = () => {
          signal.removeEventListener('abort', onAbort);
          const index = this.approvalWaiters.indexOf(wake);
          if (index !== -1) this.approvalWaiters.splice(index, 1);
        };
        this.approvalWaiters.push(wake);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  private async _startLoop(
    loop: TranslationLoop,
    onActiveCountChange?: (activeCount: number) => void,
  ): Promise<void> {
    const semaphore = new Semaphore(loop.concurrency ?? 1);
    let activeCount = 0;
    const updateActiveCount = (delta: number) => {
      activeCount += delta;
      onActiveCountChange?.(activeCount);
    };

    /** 返回 `'requeued'` 表示该分段只是换了翻译器，不算失败。 */
    const processTask = async (
      task: SegmentTask,
    ): Promise<'done' | 'requeued'> => {
      const { segment, observer, signal } = task;
      signal?.throwIfAborted();
      // 缓存和历史也要恢复格式；损坏的旧结果视为未命中，重新翻译。
      const reuse = (lines: readonly string[]) => {
        let processed: string[];
        try {
          processed = postprocessTranslationLines(segment.lines, lines);
        } catch {
          return false;
        }
        task.resolve(processed);
        observer.complete(segment, processed);
        return true;
      };
      if (this.cache) {
        const cached = await this.cache.get(segment);
        if (cached && reuse(cached)) return 'done';
      }
      if (segment.context?.expired === false && segment.context?.history) {
        if (reuse(segment.context.history.translatedLines)) return 'done';
      }
      // 空行与图片行不透传给翻译器，等译文回来再按原位回填。
      const { indexes, content } = splitPassthroughLines(segment.lines);
      if (content.length === 0) {
        const original = [...segment.lines];
        task.resolve(original);
        observer.complete(segment, original);
        return 'done';
      }
      // 输入取消与翻译器退休都算取消；不再逐段手工转发。
      const requestSignal =
        anySignal([signal, loop.abortController.signal]) ??
        loop.abortController.signal;
      try {
        requestSignal.throwIfAborted();
        observer.start(segment, loop.id);
        const translatedLines = mergeTranslatedLines(
          segment.lines,
          indexes,
          await attemptTranslation(loop.translator, {
            lines: content,
            context: segment.context,
            signal: requestSignal,
          }),
        );
        requestSignal.throwIfAborted();
        if (this.cache) {
          await this.cache.set(segment, translatedLines);
        }
        requestSignal.throwIfAborted();
        task.resolve(translatedLines);
        observer.complete(segment, translatedLines);
        return 'done';
      } catch (error) {
        // 只是这个翻译器退休：分段退回队列，交给其他翻译器继续。
        if (
          loop.abortController.signal.aborted &&
          !signal?.aborted &&
          this.translatorLoops.size > 0
        ) {
          this.queue.requeue([task]);
          return 'requeued';
        }
        throw error;
      }
    };

    while (!loop.abortController.signal.aborted) {
      try {
        await this.waitUntilApproved(loop);
      } catch {
        break;
      }
      await semaphore.acquire();
      try {
        const task = await this.queue.dequeue(loop.abortController.signal);
        updateActiveCount(1);
        let requeued = false;
        processTask(task)
          .then((outcome) => {
            requeued = outcome === 'requeued';
          })
          .catch((error: unknown) => {
            task.reject(error);
            task.observer.error(task.segment, error);
          })
          .finally(() => {
            // 退回队列的分段仍算在途，由下一个消费者 ack。
            if (!requeued) this.queue.ack();
            semaphore.release();
            updateActiveCount(-1);
          });
      } catch (err: any) {
        semaphore.release();
        if (loop.abortController.signal.aborted) break;
      }
    }
  }

  unregisterTranslator(translatorId: string): void {
    const loop = this.translatorLoops.get(translatorId);
    if (loop) {
      loop.abortController.abort();
      this.translatorLoops.delete(translatorId);
      this._updateHighWaterMark();
    }
  }

  /**
   * 停止所有翻译器，取消未完成的输入并清空队列。
   * 未完成的 `translate`/`submit` 会以 AbortError 结束；之后仍可重新注册翻译器继续使用。
   */
  dispose(): void {
    // 先取消输入：在途分段由消费者退出，排队分段由队列清空结算。
    this.lifecycle.abort(new DOMException('翻译流水线已关闭', 'AbortError'));
    for (const [, loop] of this.translatorLoops) {
      loop.abortController.abort();
    }
    this.translatorLoops.clear();
    this._updateHighWaterMark();
    this.queue.clear();
    this.lifecycle = new AbortController();
  }

  private _updateHighWaterMark(): void {
    let totalConcurrency = 0;
    for (const loop of this.translatorLoops.values()) {
      totalConcurrency += loop.concurrency ?? 1;
    }
    // 使用配置容量而非瞬时忙碌数；降低阈值不移除已在途的分段。
    this.queue.setHighWaterMark(Math.max(1, totalConcurrency * 2));
  }
}
