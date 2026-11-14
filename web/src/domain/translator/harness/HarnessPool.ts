import type {
  TranslationWork,
  TranslatorOptions,
} from '@auto-novel/translator';
import { awaitWithSignal } from '../prepare-work';
import type { ChapterTranslator } from './HarnessMode';

interface HarnessWorker {
  translate: ChapterTranslator;
  concurrency: number;
  active: number;
  controller: AbortController;
  onActiveCountChange?: (count: number) => void;
}

/** 整章执行槽位；任务准备、保存和版本管理仍由工作区负责。 */
export class HarnessPool {
  private readonly workers = new Map<string, HarnessWorker>();
  private readonly pending = new Set<Promise<void>>();
  private readonly capacityWaiters = new Set<() => void>();
  private settlementError: unknown;

  register(
    id: string,
    translate: ChapterTranslator,
    options: Omit<TranslatorOptions, 'id'> = {},
  ): void {
    const concurrency = options.concurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new RangeError('Translator concurrency must be a positive integer');
    this.unregister(id);
    this.workers.set(id, {
      translate,
      concurrency,
      active: 0,
      controller: new AbortController(),
      onActiveCountChange: options.onActiveCountChange,
    });
    this.notifyCapacity();
  }

  unregister(id: string): void {
    this.workers.get(id)?.controller.abort();
    this.workers.delete(id);
    this.notifyCapacity();
  }

  private notifyCapacity(): void {
    for (const wake of this.capacityWaiters) wake();
    this.capacityWaiters.clear();
  }

  /** 没有 Harness 翻译器时返回 false，调用方继续走普通流水线。 */
  async submit(
    work: TranslationWork,
    signal = new AbortController().signal,
  ): Promise<boolean> {
    while (this.workers.size > 0) {
      const worker = [...this.workers.values()].find(
        (worker) => worker.active < worker.concurrency,
      );
      try {
        signal.throwIfAborted();
        if (!worker) {
          let wake!: () => void;
          const capacity = new Promise<void>((resolve) => {
            wake = resolve;
            this.capacityWaiters.add(wake);
          });
          try {
            await awaitWithSignal(capacity, signal);
          } finally {
            this.capacityWaiters.delete(wake);
          }
          continue;
        }
      } catch (error) {
        if (signal.aborted) await work.onAbort();
        throw error;
      }

      const controller = new AbortController();
      const abortWorker = () =>
        controller.abort(worker.controller.signal.reason);
      const abortInput = () => controller.abort(signal.reason);
      worker.controller.signal.addEventListener('abort', abortWorker, {
        once: true,
      });
      signal.addEventListener('abort', abortInput, { once: true });
      if (signal.aborted) abortInput();
      worker.active++;
      worker.onActiveCountChange?.(worker.active);

      const settled = Promise.resolve()
        .then(async () => {
          try {
            controller.signal.throwIfAborted();
            const result = await awaitWithSignal(
              worker.translate(work, controller.signal),
              controller.signal,
            );
            controller.signal.throwIfAborted();
            await work.onComplete(result);
          } catch (error) {
            if (controller.signal.aborted) {
              await work.onAbort();
            } else {
              await work.onError(error);
            }
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) this.settlementError = error;
        })
        .finally(() => {
          worker.controller.signal.removeEventListener('abort', abortWorker);
          signal.removeEventListener('abort', abortInput);
          worker.active--;
          worker.onActiveCountChange?.(worker.active);
          this.pending.delete(settled);
          this.notifyCapacity();
        });
      this.pending.add(settled);
      return true;
    }
    return false;
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
    const error = this.settlementError;
    this.settlementError = undefined;
    if (error !== undefined) throw error;
  }

  dispose(): void {
    for (const id of this.workers.keys()) this.unregister(id);
  }
}
