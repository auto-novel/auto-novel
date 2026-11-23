import type { Logger } from '@/types';

const DEFAULT_COOLDOWN_MS = 1_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

function retryDelay(header: string | null, now: number): number {
  const value = header?.trim() ?? '';
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1_000
    : /^[A-Za-z]/.test(value)
      ? Date.parse(value) - now
      : NaN;
  return delay > 0 && Number.isSafeInteger(now + delay)
    ? delay
    : DEFAULT_COOLDOWN_MS;
}

function waitForTimer(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 同一个 GPT 翻译器的所有请求共享限流等待时间。 */
export class GptRateLimit {
  private retryAt = 0;

  constructor(private readonly log: Logger) {}

  async wait(signal?: AbortSignal): Promise<void> {
    let remaining = this.retryAt - Date.now();
    while (remaining > 0) {
      await waitForTimer(Math.min(remaining, MAX_TIMER_MS), signal);
      remaining = this.retryAt - Date.now();
    }
    signal?.throwIfAborted();
  }

  async fetch(
    send: () => Promise<Response>,
    signal?: AbortSignal,
  ): Promise<Response> {
    // SDK 准备请求期间，其他并发请求也可能刚刚收到 429。
    while (Date.now() < this.retryAt) await this.wait(signal);
    signal?.throwIfAborted();
    const response = await send();
    if (response.status === 429) {
      const now = Date.now();
      const delay = retryDelay(response.headers.get('Retry-After'), now);
      const retryAt = now + delay;
      if (retryAt > this.retryAt) {
        this.retryAt = retryAt;
        this.log(
          `收到 429 限流，等待 ${Math.ceil(delay / 1_000)} 秒后继续请求`,
        );
      }
    }
    return response;
  }
}
