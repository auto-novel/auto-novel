import { expect, it, vi } from 'vitest';
import type { TranslationWork } from '@auto-novel/translator';
import { HarnessPool } from '../src/domain/translator/harness/HarnessPool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const work = (): TranslationWork => ({
  lines: ['source'],
  onComplete: vi.fn(),
  onError: vi.fn(),
  onAbort: vi.fn(),
});

it('respects per-worker chapter concurrency and drains save callbacks', async () => {
  const pool = new HarnessPool();
  const first = deferred<{ lines: string[]; failed: [] }>();
  const saved = deferred<void>();
  const translate = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue({ lines: ['translation'], failed: [] });
  const counts = vi.fn();
  pool.register('worker', translate, {
    concurrency: 1,
    onActiveCountChange: counts,
  });
  const one = work();
  one.onComplete = vi.fn(() => saved.promise);
  const two = work();
  expect(await pool.submit(one)).toBe(true);
  const queued = pool.submit(two);
  await Promise.resolve();
  expect(translate).toHaveBeenCalledOnce();
  first.resolve({ lines: ['translation'], failed: [] });
  await vi.waitFor(() => expect(one.onComplete).toHaveBeenCalledOnce());
  expect(translate).toHaveBeenCalledOnce();
  saved.resolve();
  expect(await queued).toBe(true);
  await pool.drain();
  expect(two.onComplete).toHaveBeenCalledWith({
    lines: ['translation'],
    failed: [],
  });
  expect(counts.mock.calls.map(([count]) => count)).toEqual([1, 0, 1, 0]);
  pool.dispose();
});

it('cancels stopped workers even if the engine ignores abort, without saving late results', async () => {
  const pool = new HarnessPool();
  const pending = deferred<{ lines: string[]; failed: [] }>();
  const translate = vi.fn(() => pending.promise);
  pool.register('worker', translate);
  const input = work();
  await pool.submit(input);
  await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
  const next = work();
  const waiting = pool.submit(next);
  pool.unregister('worker');
  expect(await waiting).toBe(false);
  await pool.drain();
  expect(input.onAbort).toHaveBeenCalledOnce();
  expect(input.onError).not.toHaveBeenCalled();
  expect(input.onComplete).not.toHaveBeenCalled();
  expect(next.onComplete).not.toHaveBeenCalled();
  pending.resolve({ lines: ['late'], failed: [] });
  await Promise.resolve();
  expect(input.onComplete).not.toHaveBeenCalled();
});

it('settles engine errors and surfaces failed save callbacks through drain', async () => {
  const pool = new HarnessPool();
  const error = new Error('engine failed');
  pool.register(
    'worker',
    vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ lines: ['translation'], failed: [] }),
  );
  const input = work();
  await pool.submit(input);
  await pool.drain();
  expect(input.onError).toHaveBeenCalledWith(error);
  const second = work();
  const saveError = new Error('save failed');
  second.onComplete = vi.fn(() => {
    throw saveError;
  });
  second.onError = vi.fn(() => {
    throw saveError;
  });
  await pool.submit(second);
  await expect(pool.drain()).rejects.toBe(saveError);
  pool.dispose();
});

it('cancels callers waiting for a free slot and leaves active work alone', async () => {
  const pool = new HarnessPool();
  const pending = deferred<{ lines: string[]; failed: [] }>();
  pool.register('worker', () => pending.promise);
  await pool.submit(work());
  const controller = new AbortController();
  const waiting = work();
  const queued = pool.submit(waiting, controller.signal);
  controller.abort();
  await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  expect(waiting.onAbort).toHaveBeenCalledOnce();
  expect(waiting.onComplete).not.toHaveBeenCalled();
  expect(waiting.onError).not.toHaveBeenCalled();
  pending.resolve({ lines: ['translation'], failed: [] });
  await pool.drain();
  pool.dispose();
});

it('uses newly registered capacity without waiting for an existing chapter to finish', async () => {
  const pool = new HarnessPool();
  const pending = deferred<{ lines: string[]; failed: [] }>();
  pool.register('first', () => pending.promise);
  await pool.submit(work());
  const second = work();
  const waiting = pool.submit(second);
  pool.register('second', async () => ({ lines: ['second'], failed: [] }));
  try {
    await vi.waitFor(() => expect(second.onComplete).toHaveBeenCalledOnce());
    expect(await waiting).toBe(true);
  } finally {
    pending.resolve({ lines: ['first'], failed: [] });
    await pool.drain();
    pool.dispose();
  }
});
