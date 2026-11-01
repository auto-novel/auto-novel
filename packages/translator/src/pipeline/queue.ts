import type { Segment } from '@/types';

/** 分段级进度事件；一次输入共用一份。 */
interface SegmentObserver {
  /** 某分段开始翻译。 */
  start(segment: Segment, translatorId: string): void;
  /** 某分段完成，译文已合并透传行。 */
  complete(segment: Segment, translatedLines: readonly string[]): void;
  /** 某分段失败。 */
  error(segment: Segment, error: unknown): void;
}

/** 队列搬运的单位：分段 + 结算句柄 + 该输入的事件出口。 */
export interface SegmentTask {
  readonly segment: Segment;
  readonly observer: SegmentObserver;
  readonly signal?: AbortSignal;
  resolve(translatedLines: string[]): void;
  reject(error: unknown): void;
}

export class SegmentQueue {
  private readonly _items: SegmentTask[] = [];
  /** 入队容量，由流水线按已注册翻译器的总并发设置；设置前只允许 1 个在途分段。 */
  private _highWaterMark = 1;
  /** 系统中所有在途（排队中+翻译中）的分片总数 */
  private _enqueuedCount = 0;

  /** 等待出队的消费者 resolve 回调队列（FIFO） */
  private readonly _dequeueResolvers: Array<(task: SegmentTask) => void> = [];

  /** 水位变化通知；实际入队仍由 Promise 链串行检查容量。 */
  private _hwResolvers: Array<() => void> = [];
  /** 串行入队链；始终正常完成，避免一次失败阻断后续输入。 */
  private _enqueueTail: Promise<void> = Promise.resolve();

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

  enqueueAll(tasks: SegmentTask[], signal?: AbortSignal): Promise<void> {
    const enqueued = this._enqueueTail.then(async () => {
      let offset = 0;
      while (offset < tasks.length) {
        await this.waitUntilBelowHighWaterMark(signal);
        signal?.throwIfAborted();
        const count = Math.min(
          tasks.length - offset,
          this._highWaterMark - this._enqueuedCount,
        );
        this._enqueue(tasks.slice(offset, offset + count));
        offset += count;
      }
    });
    this._enqueueTail = enqueued.catch(() => {});
    return enqueued;
  }

  private _enqueue(tasks: SegmentTask[]): void {
    const segLen = tasks.length;
    if (segLen === 0) return;
    this._enqueuedCount += segLen;

    const resolverLen = this._dequeueResolvers.length;
    const matchCount = Math.min(segLen, resolverLen);

    if (matchCount > 0) {
      for (let i = 0; i < matchCount; i++) {
        this._dequeueResolvers[i](tasks[i]);
      }
      this._dequeueResolvers.splice(0, matchCount);
    }
    if (segLen > matchCount) {
      for (let i = matchCount; i < segLen; i++) {
        this._items.push(tasks[i]);
      }
    }
  }

  async dequeue(signal?: AbortSignal): Promise<SegmentTask> {
    signal?.throwIfAborted();

    if (this._items.length > 0) {
      const item = this._items.shift()!;
      return item;
    }
    return new Promise<SegmentTask>((resolve, reject) => {
      const onAbort = () => {
        const idx = this._dequeueResolvers.indexOf(dequeueResolver);
        if (idx !== -1) this._dequeueResolvers.splice(idx, 1);
        reject(signal!.reason);
      };
      const dequeueResolver = (task: SegmentTask) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(task);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this._dequeueResolvers.push(dequeueResolver);
    });
  }

  async waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();

    while (this._enqueuedCount >= this._highWaterMark) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const idx = this._hwResolvers.indexOf(onReady);
          if (idx !== -1) this._hwResolvers.splice(idx, 1);
          signal?.removeEventListener('abort', onAbort);
          reject(signal!.reason);
        };
        const onReady = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        this._hwResolvers.push(onReady);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      signal?.throwIfAborted();
    }
  }

  /** 消费者完成一个分片后调用，释放一个槽位。 */
  ack(): void {
    this._enqueuedCount--;
    this._tryResolveHw();
  }

  private _tryResolveHw(): void {
    if (this._enqueuedCount < this._highWaterMark) {
      // 拉取者可能发现输入已耗尽，因此不能只唤醒一个等待者。
      for (const resolve of this._hwResolvers.splice(0)) resolve();
    }
  }

  /**
   * 分段未能完成（例如消费它的翻译器被移除）时退回队列。
   * 在途计数不变，因此调用方不得再 ack 该分段。
   */
  requeue(tasks: readonly SegmentTask[]): void {
    if (tasks.length === 0) return;
    // 先还给等待中的消费者，其余放到队首，尽量保持原有推进顺序。
    const waiterCount = Math.min(tasks.length, this._dequeueResolvers.length);
    for (let i = 0; i < waiterCount; i++) {
      this._dequeueResolvers[i](tasks[i]);
    }
    if (waiterCount > 0) this._dequeueResolvers.splice(0, waiterCount);
    if (tasks.length > waiterCount) {
      this._items.unshift(...tasks.slice(waiterCount));
    }
    this._tryResolveHw();
  }

  /** 只移除尚未开始的分段；执行中的分段仍由消费者 ack。 */
  removeQueued(tasks: readonly SegmentTask[]): void {
    const removed = new Set(tasks);
    const before = this._items.length;
    let write = 0;
    for (const task of this._items) {
      if (!removed.has(task)) this._items[write++] = task;
    }
    this._items.length = write;
    this._enqueuedCount -= before - write;
    this._tryResolveHw();
  }

  /** 清空队列；残留任务按失败结算，避免调用方永久等待。 */
  clear(): void {
    const tasks = this._items.splice(0);
    this._enqueuedCount -= tasks.length;
    for (const task of tasks) task.reject(new Error('翻译流水线已关闭'));
    const hw = this._hwResolvers.splice(0);
    for (const resolve of hw) resolve();
    this._dequeueResolvers.splice(0);
  }
}
