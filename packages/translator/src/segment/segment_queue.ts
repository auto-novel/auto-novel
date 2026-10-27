import type { Segment, SegmentQueue } from '@/types';
import { Semaphore } from '@/utils';

export class DefaultSegmentQueue implements SegmentQueue {
  private readonly _items: Segment[] = [];
  private _highWaterMark: number;
  /** 系统中所有在途（排队中+翻译中）的分片总数 */
  private _enqueuedCount = 0;

  /** 等待出队的消费者 resolve 回调队列（FIFO） */
  private readonly _dequeueResolvers: Array<(seg: Segment) => void> = [];

  /** 等待水位下降的生产者 resolve 回调队列（FIFO），ack 每次只释放一个 */
  private _hwResolvers: Array<() => void> = [];
  /** 入队锁，防止多任务 enqueueAll 交错 */
  private readonly _enqueueLock = new Semaphore(1);

  constructor(highWaterMark: number) {
    this._highWaterMark = this._normalizeHighWaterMark(highWaterMark);
  }

  private _normalizeHighWaterMark(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Queue high water mark must be positive and finite');
    }
    return Math.max(1, Math.floor(value));
  }

  setHighWaterMark(value: number): void {
    const previous = this._highWaterMark;
    this._highWaterMark = this._normalizeHighWaterMark(value);
    if (
      this._highWaterMark > previous &&
      this._enqueuedCount < this._highWaterMark
    ) {
      // 水位上调可能释放多个等待者；ack 仍然只按 FIFO 释放一个。
      const resolvers = this._hwResolvers.splice(0);
      for (const resolve of resolvers) resolve();
    }
  }

  get length(): number {
    return this._items.length;
  }

  get highWaterMark(): number {
    return this._highWaterMark;
  }

  async enqueueAll(segments: Segment[], signal?: AbortSignal): Promise<void> {
    await this._enqueueLock.use(async () => {
      do {
        await this.waitUntilBelowHighWaterMark(signal);
      } while (this._enqueuedCount >= this._highWaterMark);
      this._enqueue(segments);
    });
  }

  private _enqueue(segments: Segment[]): void {
    const segLen = segments.length;
    if (segLen === 0) return;
    this._enqueuedCount += segLen;

    const resolverLen = this._dequeueResolvers.length;
    const matchCount = Math.min(segLen, resolverLen);

    if (matchCount > 0) {
      for (let i = 0; i < matchCount; i++) {
        this._dequeueResolvers[i](segments[i]);
      }
      this._dequeueResolvers.splice(0, matchCount);
    }
    if (segLen > matchCount) {
      for (let i = matchCount; i < segLen; i++) {
        this._items.push(segments[i]);
      }
    }
  }

  async dequeue(signal?: AbortSignal): Promise<Segment> {
    signal?.throwIfAborted();

    if (this._items.length > 0) {
      const item = this._items.shift()!;
      return item;
    }
    return new Promise<Segment>((resolve, reject) => {
      const onAbort = () => {
        const idx = this._dequeueResolvers.indexOf(dequeueResolver);
        if (idx !== -1) this._dequeueResolvers.splice(idx, 1);
        reject(signal!.reason);
      };
      const dequeueResolver = (seg: Segment) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(seg);
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

  /**
   * 消费者完成一个分片后调用，释放一个槽位
   * 如果提供了next，将next中的分片排入队首（顺序执行的分片链表）
   * */
  ack(next?: Segment): void {
    if (next) {
      const resolve = this._dequeueResolvers.shift();
      if (resolve) {
        resolve(next);
      } else {
        this._items.unshift(next);
      }
      return;
    }
    this._enqueuedCount--;
    this._tryResolveHw();
  }

  /** 检查并尝试唤醒一个等待水位下降的生产者 */
  private _tryResolveHw(): void {
    if (
      this._hwResolvers.length > 0 &&
      this._enqueuedCount < this._highWaterMark
    ) {
      const resolve = this._hwResolvers.shift()!;
      resolve();
    }
  }

  clear(): void {
    this._enqueuedCount -= this._items.length;
    this._items.length = 0;
    const hw = this._hwResolvers.splice(0);
    for (const resolve of hw) resolve();
    this._dequeueResolvers.splice(0);
  }
}
