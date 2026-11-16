type SharedRequest<T> = {
  controller: AbortController;
  promise: Promise<T>;
  users: number;
};

/** 仅合并进行中的同一请求；每个调用方保留独立的取消信号。 */
export class InFlightRequests<T> {
  private readonly entries = new Map<string, SharedRequest<T>>();

  run(
    key: string,
    request: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = {
        controller,
        promise: Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return request(controller.signal);
        }),
        users: 0,
      };
      this.entries.set(key, entry);
      const shared = entry;
      const settle = () => {
        if (this.entries.get(key) === shared) this.entries.delete(key);
      };
      void shared.promise.then(settle, settle);
    }
    const shared = entry;
    shared.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', abort);
        shared.users--;
        if (shared.users === 0 && this.entries.get(key) === shared) {
          this.entries.delete(key);
          shared.controller.abort();
        }
        return true;
      };
      const abort = () => {
        if (finish()) reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      void shared.promise.then(
        (value) => {
          if (finish()) resolve(value);
        },
        (error: unknown) => {
          if (finish()) reject(error);
        },
      );
    });
  }
}
