import {
  createLineSegmenter,
  createSegmentAssembler,
  DefaultSegmentQueue,
} from '@/segment';
import {
  LineSegmenter,
  Segment,
  SegmentAssembler,
  SegmentObserver,
  SegmentTask,
  TranslationLoop,
  TranslationInput,
  TranslationResult,
  TranslationWork,
  Translator,
  SegmentCache,
  TranslatorOptions,
  TranslatorTracker,
} from '@/types';
import { Semaphore, anySignal, randomUUID } from '@/utils';
import {
  mergeTranslatedLines,
  splitPassthroughLines,
} from '@/translation-lines';
import { attemptTranslation } from './attempt';
import { postprocessTranslationLines } from './postprocess';

/** 一个输入切分后的任务与整体结果。 */
type PreparedInput = {
  tasks: SegmentTask[];
  result: Promise<TranslationResult>;
};

/** 已切分并入队的输入：`enqueued` 只代表投递完成，`result` 才是结算。 */
type StartedInput = {
  enqueued: Promise<void>;
  result: Promise<TranslationResult>;
};

export class TranslationPipeline {
  private readonly queue: DefaultSegmentQueue;
  private readonly translatorLoops: Map<string, TranslationLoop>;
  private readonly segmenter: LineSegmenter;
  private readonly assembler: SegmentAssembler;
  private readonly cache?: SegmentCache;
  /** 当前生命周期；dispose 时取消所有未完成输入，之后换成新的。 */
  private lifecycle = new AbortController();

  /**
   * 队列水位始终跟随已注册翻译器的总并发（auto）；构造时尚未注册翻译器，
   * 因此从 1 开始，注册后由 _updateHighWaterMark 上调。
   */
  constructor(
    options: { segmenter?: LineSegmenter; cache?: SegmentCache } = {},
  ) {
    this.translatorLoops = new Map();
    this.queue = new DefaultSegmentQueue();
    this.segmenter = options.segmenter ?? createLineSegmenter(1500, 30);
    this.assembler = createSegmentAssembler();
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
   * `translate` 等到结算返回；`run` 只等投递完成就继续补货。
   */
  private start(input: TranslationInput, signal?: AbortSignal): StartedInput {
    // dispose 也要能取消未完成的输入，避免入队被背压卡住或结算悬空。
    const inputSignal =
      anySignal([signal, this.lifecycle.signal]) ?? this.lifecycle.signal;
    const { tasks, result } = this.prepareInput(input, inputSignal);
    // 入队也可能因背压等待，提前接住取消产生的拒绝。
    void result.catch(() => {});
    return { enqueued: this.queue.enqueueAll(tasks, inputSignal), result };
  }

  /**
   * 按水位拉取输入；每个输入通过自身的 onComplete/onError/onAbort 结算。
   * 取消时每个在途输入收到 onAbort，run 以 AbortError 结束。
   */
  async run(
    source: AsyncIterable<TranslationWork>,
    options: { signal?: AbortSignal; maxPendingInputs?: number } = {},
  ): Promise<void> {
    const maxPending = options.maxPendingInputs ?? 16;
    if (!Number.isInteger(maxPending) || maxPending < 1) {
      throw new RangeError('maxPendingInputs must be a positive integer');
    }
    // 取消来源有两个：调用方传入的信号，以及 run 自身结束（含失败）。
    const controller = new AbortController();
    const signal =
      anySignal([options.signal, controller.signal]) ?? controller.signal;
    const pending = new Set<Promise<void>>();
    const iterator = source[Symbol.asyncIterator]();
    let exhausted = false;
    try {
      while (true) {
        signal.throwIfAborted();
        if (pending.size >= maxPending) await Promise.race(pending);
        await this.queue.waitUntilBelowHighWaterMark(signal);
        const next = await iterator.next();
        if (next.done) {
          exhausted = true;
          break;
        }
        const input = next.value;
        let started: StartedInput;
        try {
          started = this.start(input, signal);
          await started.enqueued;
        } catch (error) {
          if (signal.aborted) {
            await input.onAbort();
            signal.throwIfAborted();
          }
          await input.onError(error);
          continue;
        }
        const task = started.result
          .then((translated) => {
            signal.throwIfAborted();
            return input.onComplete(translated);
          })
          .catch((error: unknown) =>
            signal.aborted ? input.onAbort() : input.onError(error),
          )
          .catch((error: unknown) => controller.abort(error))
          .finally(() => pending.delete(task));
        pending.add(task);
      }
      await Promise.all(pending);
      signal.throwIfAborted();
    } finally {
      controller.abort();
      await Promise.all(pending);
      if (!exhausted) await iterator.return?.();
    }
  }

  private prepareInput(
    input: TranslationInput,
    signal?: AbortSignal,
  ): PreparedInput {
    signal?.throwIfAborted();
    const { lines, glossary, history, tracker } = input;
    const ranges = this.segmenter.segment(lines);
    const segments = this.assembler.assemble(
      randomUUID(),
      lines,
      ranges,
      glossary ?? {},
      history,
    );
    tracker?.onSegmentsReady?.(
      segments.map(({ order, lines }) => ({ order, lines })),
    );
    // 取消后不再向调用方转发分段事件，避免把取消记成分段失败。
    const observer: SegmentObserver = {
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
    };
    this.translatorLoops.set(id, loop);
    this._updateHighWaterMark();
    this._startLoop(loop, options.tracker);
    return id;
  }

  private async _startLoop(
    loop: TranslationLoop,
    tracker?: TranslatorTracker,
  ): Promise<void> {
    const semaphore = new Semaphore(loop.concurrency ?? 1);
    let activeCount = 0;
    const updateConcurrency = (delta: number) => {
      activeCount = activeCount + delta;
      tracker?.onConcurrencyChange?.(activeCount, semaphore.max);
    };

    /** 返回 `'requeued'` 表示该分段只是换了翻译器，不算失败。 */
    const processTask = async (
      task: SegmentTask,
    ): Promise<'done' | 'requeued'> => {
      const { segment, observer, signal } = task;
      signal?.throwIfAborted();
      // 缓存和历史也要恢复格式；损坏的旧结果视为未命中，重新翻译。
      const reuse = (lines: string[]) => {
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
      await semaphore.acquire();
      try {
        const task = await this.queue.dequeue(loop.abortController.signal);
        updateConcurrency(1);
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
            updateConcurrency(-1);
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
   * 未完成的 `translate`/`run` 会以 AbortError 结束；之后仍可重新注册翻译器继续使用。
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
