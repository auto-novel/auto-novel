import { afterEach, expect, it, vi } from 'vitest';
import { TaskLifecycle } from '../src/domain/translator/TaskLifecycle';

afterEach(() => vi.unstubAllGlobals());

it('fallback isolates task cancellation, supports restart and cleans up listeners', () => {
  // 原生 AbortSignal.any 由工作区回归测试覆盖；这里只验证兼容实现。
  vi.stubGlobal('AbortSignal', { any: undefined });
  const task = new TaskLifecycle(1);
  const other = new TaskLifecycle(1);
  const run = new AbortController();
  const signal = task.signalFor(run.signal);
  expect(task.signalFor(run.signal)).toBe(signal);
  run.abort();
  expect(signal.aborted).toBe(true);
  expect(task.signal.aborted).toBe(false);

  const resumed = new AbortController();
  const resumedSignal = task.signalFor(resumed.signal);
  const otherSignal = other.signalFor(resumed.signal);
  expect(resumedSignal.aborted).toBe(false);
  const removeTask = vi.spyOn(task.signal, 'removeEventListener');
  const removeRun = vi.spyOn(resumed.signal, 'removeEventListener');
  task.abort();
  expect(resumedSignal.aborted).toBe(true);
  expect(otherSignal.aborted).toBe(false);
  expect(removeTask).toHaveBeenCalledOnce();
  expect(removeRun).toHaveBeenCalledOnce();
  expect(task.signalFor(new AbortController().signal).aborted).toBe(true);
});
