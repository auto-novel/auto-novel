import type { Segment } from '@/types';

/** 分段级进度事件；一次输入共用一份。 */
interface SegmentObserver {
  start(segment: Segment, translatorId: string): void;
  complete(segment: Segment, translatedLines: readonly string[]): void;
  error(segment: Segment, error: unknown): void;
}

/** 分段及其输入的调度约束、结算句柄。 */
export interface SegmentTask {
  readonly segment: Segment;
  readonly trustedOnly?: boolean;
  readonly observer: SegmentObserver;
  readonly signal?: AbortSignal;
  resolve(translatedLines: string[]): void;
  reject(error: unknown): void;
}

interface Consumer {
  accepts: (task: SegmentTask) => boolean;
  resolve: (task: SegmentTask) => void;
}

export class SegmentQueue {
  private readonly _items: SegmentTask[] = [];
  private _highWaterMark = 1;
  // 两类输入分别背压，避免没有可信翻译器时，受限输入占满容量堵住本地／试译。
  // 每类最多 highWaterMark 个在途分段；同类输入仍按投递顺序串行入队。
  private readonly _enqueuedCount = [0, 0];
  private readonly _enqueueTail = [Promise.resolve(), Promise.resolve()];
  private readonly _dequeueResolvers: Consumer[] = [];
  private _hwResolvers: Array<() => void> = [];

  private lane(trustedOnly = false): number {
    return trustedOnly ? 1 : 0;
  }

  setHighWaterMark(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Queue high water mark must be positive and finite');
    }
    this._highWaterMark = Math.max(1, Math.floor(value));
    this._tryResolveHw();
  }

  get length(): number {
    return this._items.length;
  }

  /** 一次输入的所有分段必须使用同一 trustedOnly 约束。 */
  enqueueAll(tasks: SegmentTask[], signal?: AbortSignal): Promise<void> {
    const trustedOnly = tasks[0]?.trustedOnly === true;
    if (tasks.some((task) => (task.trustedOnly === true) !== trustedOnly)) {
      return Promise.reject(new Error('同一输入的可信要求必须一致'));
    }
    const lane = this.lane(trustedOnly);
    const enqueued = this._enqueueTail[lane].then(async () => {
      let offset = 0;
      while (offset < tasks.length) {
        await this.waitUntilBelowHighWaterMark(signal, trustedOnly);
        signal?.throwIfAborted();
        // 等待恢复与本次执行之间，移除翻译器可能再次降低水位。
        const capacity = this._highWaterMark - this._enqueuedCount[lane];
        if (capacity <= 0) continue;
        const count = Math.min(tasks.length - offset, capacity);
        this._enqueuedCount[lane] += count;
        this.dispatch(tasks.slice(offset, offset + count));
        offset += count;
      }
    });
    this._enqueueTail[lane] = enqueued.catch(() => {});
    return enqueued;
  }

  /** 分配给最早匹配的消费者；不匹配的任务保留原顺序。 */
  private dispatch(tasks: readonly SegmentTask[], front = false): void {
    const remaining: SegmentTask[] = [];
    for (const task of tasks) {
      const index = this._dequeueResolvers.findIndex((consumer) =>
        consumer.accepts(task),
      );
      if (index === -1) remaining.push(task);
      else this._dequeueResolvers.splice(index, 1)[0].resolve(task);
    }
    if (front) this._items.unshift(...remaining);
    else this._items.push(...remaining);
  }

  async dequeue(
    signal?: AbortSignal,
    accepts: (task: SegmentTask) => boolean = () => true,
  ): Promise<SegmentTask> {
    signal?.throwIfAborted();
    const index = this._items.findIndex(accepts);
    if (index !== -1) return this._items.splice(index, 1)[0];
    return new Promise<SegmentTask>((resolve, reject) => {
      const onAbort = () => {
        const index = this._dequeueResolvers.indexOf(consumer);
        if (index !== -1) this._dequeueResolvers.splice(index, 1);
        reject(signal!.reason);
      };
      const consumer: Consumer = {
        accepts,
        resolve: (task) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(task);
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this._dequeueResolvers.push(consumer);
    });
  }

  async waitUntilBelowHighWaterMark(
    signal?: AbortSignal,
    trustedOnly = false,
  ): Promise<void> {
    signal?.throwIfAborted();
    while (this._enqueuedCount[this.lane(trustedOnly)] >= this._highWaterMark) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
          const index = this._hwResolvers.indexOf(wake);
          if (index !== -1) this._hwResolvers.splice(index, 1);
        };
        const wake = () => {
          cleanup();
          resolve();
        };
        const onAbort = () => {
          cleanup();
          reject(signal!.reason);
        };
        this._hwResolvers.push(wake);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      signal?.throwIfAborted();
    }
  }

  /** 消费完成后释放该类输入的一个槽位。 */
  ack(task: SegmentTask): void {
    this._enqueuedCount[this.lane(task.trustedOnly)]--;
    this._tryResolveHw();
  }

  private _tryResolveHw(): void {
    for (const resolve of this._hwResolvers.splice(0)) resolve();
  }

  /** 翻译器退休时按原约束退回任务，在途计数不变。 */
  requeue(tasks: readonly SegmentTask[]): void {
    this.dispatch(tasks, true);
  }

  /** 执行中的分段仍由消费者 ack。 */
  removeQueued(tasks: readonly SegmentTask[]): void {
    const removed = new Set(tasks);
    let write = 0;
    for (const task of this._items) {
      if (removed.has(task)) {
        this._enqueuedCount[this.lane(task.trustedOnly)]--;
      } else this._items[write++] = task;
    }
    this._items.length = write;
    this._tryResolveHw();
  }

  clear(): void {
    for (const task of this._items.splice(0)) {
      this._enqueuedCount[this.lane(task.trustedOnly)]--;
      task.reject(new Error('翻译流水线已关闭'));
    }
    this._tryResolveHw();
    this._dequeueResolvers.splice(0);
  }
}
