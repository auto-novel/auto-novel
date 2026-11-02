/** 一个任务版本的生命周期；执行轮次可取消，但不能恢复已失效的任务版本。 */
export class TaskLifecycle {
  private readonly controller = new AbortController();
  private readonly executionSignals = new WeakMap<AbortSignal, AbortSignal>();

  constructor(readonly createAt: number) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(): void {
    this.controller.abort();
  }

  /** 同一任务版本与执行轮次共享信号，避免逐章创建监听和清理逻辑。 */
  signalFor(execution: AbortSignal): AbortSignal {
    const cached = this.executionSignals.get(execution);
    if (cached) return cached;

    let signal: AbortSignal;
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([this.signal, execution]);
    } else {
      // 兼容尚不支持 AbortSignal.any 的浏览器，任一来源取消后释放两侧监听。
      const combined = new AbortController();
      const abortTask = () => combined.abort(this.signal.reason);
      const abortExecution = () => combined.abort(execution.reason);
      combined.signal.addEventListener(
        'abort',
        () => {
          this.signal.removeEventListener('abort', abortTask);
          execution.removeEventListener('abort', abortExecution);
        },
        { once: true },
      );
      this.signal.addEventListener('abort', abortTask, { once: true });
      execution.addEventListener('abort', abortExecution, { once: true });
      if (this.signal.aborted) abortTask();
      else if (execution.aborted) abortExecution();
      signal = combined.signal;
    }
    this.executionSignals.set(execution, signal);
    return signal;
  }
}
