import type { Segment, SegmentQueue } from '@/types';

export class DefaultSegmentQueue implements SegmentQueue {
  private readonly _items: Segment[] = [];
  private readonly _highWaterMark: number;

  /** 等待出队的消费者 resolve 回调队列（FIFO） */
  private readonly _dequeueResolvers: Array<(seg: Segment) => void> = [];

  /** 等待水位下降的生产者 resolve 回调 */
  private _hwResolver: (() => void) | null = null;
  private _hwPromise: Promise<void> | null = null;

  constructor(highWaterMark: number) {
    this._highWaterMark = Math.max(1, highWaterMark);
  }

  get length(): number {
    return this._items.length;
  }

  get highWaterMark(): number {
    return this._highWaterMark;
  }

  enqueueAll(segments: Segment[]): void {
    const segLen = segments.length;
    if (segLen === 0) return;

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
      this._tryResolveHw();
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

    if (this._items.length < this._highWaterMark) return;

    if (!this._hwPromise) {
      this._hwPromise = new Promise<void>((resolve) => {
        this._hwResolver = resolve;
      });
    }

    if (!signal) return this._hwPromise;

    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });

      this._hwPromise!.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }

  /** 检查并尝试唤醒等待水位下降的生产者 */
  private _tryResolveHw(): void {
    if (this._hwResolver && this._items.length < this._highWaterMark) {
      const resolve = this._hwResolver;
      this._hwResolver = null;
      this._hwPromise = null;
      resolve();
    }
  }
}
