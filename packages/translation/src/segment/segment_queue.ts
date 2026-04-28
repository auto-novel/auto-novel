import type { Segment, SegmentQueue } from '../types';

export class SegmentQueueImpl implements SegmentQueue {
  readonly #items: Segment[] = [];
  readonly #highWaterMark: number;

  /** 等待出队的消费者 resolve 回调队列（FIFO） */
  readonly #dequeueResolvers: Array<(seg: Segment) => void> = [];

  /** 等待水位下降的生产者 resolve 回调 */
  #hwResolver: (() => void) | null = null;
  #hwPromise: Promise<void> | null = null;

  constructor(highWaterMark: number) {
    this.#highWaterMark = highWaterMark;
  }

  get length(): number {
    return this.#items.length;
  }

  get highWaterMark(): number {
    return this.#highWaterMark;
  }

  enqueueAll(segments: Segment[]): void {
    if (segments.length === 0) return;

    this.#items.push(...segments);

    // 逐个唤醒等待的消费者（一个 segment 唤醒一个消费者）
    let idx = 0;
    while (idx < segments.length && this.#dequeueResolvers.length > 0) {
      const resolve = this.#dequeueResolvers.shift()!;
      const seg = this.#items.shift()!;
      resolve(seg);
      idx++;
    }

    // 如果队列长度降至水位线以下，唤醒等待的生产者
    this.#tryResolveHw();
  }

  dequeue(): Promise<Segment> {
    // 队列非空，立即返回第一个元素
    if (this.#items.length > 0) {
      const item = this.#items.shift()!;
      // 如果队列长度降至水位线以下，唤醒等待的生产者
      this.#tryResolveHw();
      return Promise.resolve(item);
    }

    // 队列为空，创建等待 Promise
    return new Promise<Segment>((resolve) => {
      this.#dequeueResolvers.push(resolve);
    });
  }

  waitUntilBelowHighWaterMark(): Promise<void> {
    if (this.#items.length < this.#highWaterMark) {
      return Promise.resolve();
    }

    // 复用已有的 Promise，避免多个等待者冲突
    if (this.#hwPromise) {
      return this.#hwPromise;
    }

    this.#hwPromise = new Promise<void>((resolve) => {
      this.#hwResolver = resolve;
    });

    return this.#hwPromise;
  }

  /** 检查并尝试唤醒等待水位下降的生产者 */
  #tryResolveHw(): void {
    if (this.#hwResolver && this.#items.length < this.#highWaterMark) {
      const resolve = this.#hwResolver;
      const promise = this.#hwPromise!;
      this.#hwResolver = null;
      this.#hwPromise = null;
      resolve();
      promise.catch(() => {});
    }
  }
}
