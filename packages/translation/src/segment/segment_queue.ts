import type { Segment, SegmentQueue } from '@/types';

export class SegmentQueueImpl implements SegmentQueue {
  private readonly _items: Segment[] = [];
  private readonly _highWaterMark: number;

  /** 等待出队的消费者 resolve 回调队列（FIFO） */
  private readonly _dequeueResolvers: Array<(seg: Segment) => void> = [];

  /** 等待水位下降的生产者 resolve 回调 */
  private _hwResolver: (() => void) | null = null;
  private _hwPromise: Promise<void> | null = null;

  constructor(highWaterMark: number) {
    this._highWaterMark = highWaterMark;
  }

  get length(): number {
    return this._items.length;
  }

  get highWaterMark(): number {
    return this._highWaterMark;
  }

  enqueueAll(segments: Segment[]): void {
    if (segments.length === 0) return;

    this._items.push(...segments);

    // 逐个唤醒等待的消费者（一个 segment 唤醒一个消费者）
    let idx = 0;
    while (idx < segments.length && this._dequeueResolvers.length > 0) {
      const resolve = this._dequeueResolvers.shift()!;
      const seg = this._items.shift()!;
      resolve(seg);
      idx++;
    }

    this.#tryResolveHw();
  }

  dequeue(): Promise<Segment> {
    if (this._items.length > 0) {
      const item = this._items.shift()!;
      this.#tryResolveHw();
      return Promise.resolve(item);
    }
    return new Promise<Segment>((resolve) => {
      this._dequeueResolvers.push(resolve);
    });
  }

  waitUntilBelowHighWaterMark(): Promise<void> {
    if (this._items.length < this._highWaterMark) {
      return Promise.resolve();
    }

    // 复用已有的 Promise，避免多个等待者冲突
    if (this._hwPromise) {
      return this._hwPromise;
    }

    this._hwPromise = new Promise<void>((resolve) => {
      this._hwResolver = resolve;
    });

    return this._hwPromise;
  }

  /** 检查并尝试唤醒等待水位下降的生产者 */
  #tryResolveHw(): void {
    if (this._hwResolver && this._items.length < this._highWaterMark) {
      const resolve = this._hwResolver;
      const promise = this._hwPromise!;
      this._hwResolver = null;
      this._hwPromise = null;
      resolve();
      promise.catch(() => {});
    }
  }
}
