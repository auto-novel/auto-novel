import type { Segment } from '@/types';

/** 分段级进度事件；一次输入共用一份。 */
interface SegmentObserver {
  start(segment: Segment, translatorId: string): void;
  complete(segment: Segment, translatedLines: readonly string[]): void;
  error(segment: Segment, error: unknown): void;
}

export interface SegmentTask {
  readonly segment: Segment;
  readonly trustedOnly?: boolean;
  readonly getPriority?: () => number;
  readonly observer: SegmentObserver;
  readonly signal?: AbortSignal;
  resolve(translatedLines: string[]): void;
  reject(error: unknown): void;
}

type SchedulingConstraint = Pick<SegmentTask, 'trustedOnly'>;

interface Consumer {
  accepts: (task: SchedulingConstraint) => boolean;
  resolve: (task: SegmentTask) => void;
}

interface QueuedTask {
  task: SegmentTask;
  order: number;
  admit: () => void;
  cancelAdmission: (reason: unknown) => void;
}

/** 原文可整体暂存；只有执行中和已准入的等待分段占用全局水位。 */
export class SegmentQueue {
  private readonly pending: QueuedTask[] = [];
  private readonly active = new Map<SegmentTask, QueuedTask>();
  private highWaterMark = 1;
  private nextOrder = 0;
  private executable: (task: SchedulingConstraint) => boolean = () => true;
  private readonly consumers: Consumer[] = [];
  private notificationPending = false;

  constructor(private readonly onSchedulingChange?: () => void) {}

  setHighWaterMark(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        'Queue high water mark must be non-negative and finite',
      );
    }
    this.highWaterMark = Math.floor(value);
    this.refresh();
  }

  setExecutable(accepts: (task: SchedulingConstraint) => boolean): void {
    this.executable = accepts;
    this.refresh();
  }

  get length(): number {
    return this.pending.length;
  }

  private priority(task: SegmentTask): number {
    const value = task.getPriority?.() ?? 0;
    return Number.isNaN(value) ? 0 : value;
  }

  /** 暂存分段也计入需求；无法消费现有分段的空闲翻译器仍可拉取匹配输入。 */
  needsInput(priority = Infinity, trustedOnly = false): boolean {
    if (this.highWaterMark === 0 || !this.executable({ trustedOnly }))
      return false;
    let count = 0;
    for (const { task } of [...this.active.values(), ...this.pending]) {
      if (this.executable(task) && this.priority(task) <= priority) count++;
      if (count >= this.highWaterMark) break;
    }
    return (
      count < this.highWaterMark ||
      (this.active.size < this.highWaterMark &&
        this.consumers.some((consumer) => consumer.accepts({ trustedOnly })))
    );
  }

  /** 等到本输入每个分段至少准入过一次；其他输入可以随时参与优先级选择。 */
  enqueueAll(tasks: SegmentTask[], signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const trustedOnly = tasks[0]?.trustedOnly === true;
    if (tasks.some((task) => (task.trustedOnly === true) !== trustedOnly)) {
      return Promise.reject(new Error('同一输入的可信要求必须一致'));
    }
    if (tasks.length === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let remaining = tasks.length;
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const cancelAdmission = (reason: unknown) => {
        cleanup();
        reject(signal?.aborted ? signal.reason : reason);
      };
      const records = tasks.map((task): QueuedTask => {
        let everAdmitted = false;
        return {
          task,
          order: this.nextOrder++,
          admit: () => {
            if (everAdmitted) return;
            everAdmitted = true;
            if (--remaining === 0) {
              cleanup();
              resolve();
            }
          },
          cancelAdmission,
        };
      });
      const onAbort = () => {
        this.removeQueued(tasks);
        cancelAdmission(signal?.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.push(...records);
      this.refresh();
    });
  }

  /** 重排只重新选择等待分段，绝不取消执行中的请求。 */
  refresh(): void {
    this.pending.sort((a, b) => {
      const ap = this.priority(a.task);
      const bp = this.priority(b.task);
      return ap === bp ? a.order - b.order : ap < bp ? -1 : 1;
    });
    // 先把可执行分段派给空闲消费者，再分配等待水位；不能让受限分段
    // 占满等待窗口后，阻止非可信翻译器领取它本来能处理的普通分段。
    for (
      let i = 0;
      i < this.consumers.length && this.active.size < this.highWaterMark;

    ) {
      const consumer = this.consumers[i];
      const index = this.pending.findIndex(
        (item) => this.executable(item.task) && consumer.accepts(item.task),
      );
      if (index === -1) {
        i++;
        continue;
      }
      const [item] = this.pending.splice(index, 1);
      this.active.set(item.task, item);
      item.admit();
      this.consumers.splice(i, 1);
      consumer.resolve(item.task);
    }
    let capacity = Math.max(0, this.highWaterMark - this.active.size);
    for (const item of this.pending) {
      if (capacity > 0 && this.executable(item.task)) {
        capacity--;
        item.admit();
      }
    }
    if (!this.notificationPending && this.onSchedulingChange) {
      this.notificationPending = true;
      queueMicrotask(() => {
        this.notificationPending = false;
        this.onSchedulingChange?.();
      });
    }
  }

  async dequeue(
    signal?: AbortSignal,
    accepts: (task: SchedulingConstraint) => boolean = () => true,
  ): Promise<SegmentTask> {
    signal?.throwIfAborted();
    return new Promise<SegmentTask>((resolve, reject) => {
      const onAbort = () => {
        const index = this.consumers.indexOf(consumer);
        if (index !== -1) this.consumers.splice(index, 1);
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
      this.consumers.push(consumer);
      this.refresh();
    });
  }

  ack(task: SegmentTask): void {
    this.active.delete(task);
    this.refresh();
  }

  /** 退休翻译器交回分段，保留原输入和分段顺序。 */
  requeue(tasks: readonly SegmentTask[]): void {
    for (const task of tasks) {
      const item = this.active.get(task);
      if (!item) continue;
      this.active.delete(task);
      this.pending.push(item);
    }
    this.refresh();
  }

  /** 同时移除已准入和仍暂存的分段；执行中的分段仍由消费者 ack。 */
  removeQueued(tasks: readonly SegmentTask[]): void {
    const removed = new Set(tasks);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      if (removed.has(item.task)) {
        this.pending.splice(i, 1);
        item.cancelAdmission(
          item.task.signal?.reason ?? new DOMException('Aborted', 'AbortError'),
        );
      }
    }
    this.refresh();
  }

  clear(): void {
    const error = new Error('翻译流水线已关闭');
    for (const item of this.pending.splice(0)) {
      item.cancelAdmission(error);
      item.task.reject(error);
    }
    this.refresh();
  }
}
