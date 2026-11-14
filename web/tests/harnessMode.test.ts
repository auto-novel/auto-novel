import { afterEach, expect, it, vi } from 'vitest';
import { translateChapter } from '@auto-novel/translator/harness';
import { harnessPresets } from '@auto-novel/translator/harness/presets';
import { createHarnessMode } from '../src/domain/translator/harness/HarnessMode';

vi.mock('@auto-novel/translator/harness', () => ({
  translateChapter: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

it('adapts whole-input batches to upstream segment tracking and retains diagnostics', async () => {
  const source = ['source', '', 'next'];
  const tracker = {
    onHarnessStart: vi.fn(),
    onHarnessUsage: vi.fn(),
    onHarnessReasoning: vi.fn(),
    onSegmentsReady: vi.fn(),
    onSegStart: vi.fn(),
    onSegComplete: vi.fn(),
  };
  const usage = { model: 'test', batch: 1 } as Parameters<
    NonNullable<Parameters<typeof translateChapter>[0]['onUsage']>
  >[0];
  const reasoning = {
    batch: 1,
    attemptLabel: 'first',
    start: 0,
    end: 2,
    reasoning: 'reasoning',
  };
  vi.mocked(translateChapter).mockImplementationOnce(async (input) => {
    expect(input.source).toEqual(source);
    expect(input.glossary).toEqual({ source: 'translation' });
    input.onBatchesReady?.([
      { index: 0, start: 0, end: 2 },
      { index: 1, start: 2, end: 3 },
    ]);
    input.onBatchStart?.({ index: 0, start: 0, end: 2 });
    input.onUsage?.(usage);
    input.onReasoning?.(reasoning);
    input.onBatchComplete?.({ index: 0, start: 0, end: 2 }, [
      'translation',
      '',
    ]);
    return ['translation', '', 'next translation'];
  });
  const translate = createHarnessMode(
    harnessPresets[0].models[0],
    'key',
    'worker',
  );
  await expect(
    translate(
      { lines: source, glossary: { source: 'translation' }, tracker },
      new AbortController().signal,
    ),
  ).resolves.toEqual({
    lines: ['translation', '', 'next translation'],
    failed: [],
  });
  expect(tracker.onHarnessStart).toHaveBeenCalledOnce();
  expect(tracker.onSegmentsReady).toHaveBeenCalledWith([
    { id: '0', order: 0, lines: ['source', ''] },
    { id: '1', order: 1, lines: ['next'] },
  ]);
  expect(tracker.onSegStart).toHaveBeenCalledWith(0, 'worker');
  expect(tracker.onSegComplete).toHaveBeenCalledWith(0, ['translation', '']);
  expect(tracker.onHarnessUsage).toHaveBeenCalledWith(usage);
  expect(tracker.onHarnessReasoning).toHaveBeenCalledWith(reasoning);
});

it.each([false, true])(
  'tracks failure without turning cancellation into an error (%s)',
  async (abort) => {
    const controller = new AbortController();
    const tracker = { onAbort: vi.fn(), onSegError: vi.fn() };
    const error = new Error('failed');
    vi.mocked(translateChapter).mockImplementationOnce(async (input) => {
      input.onBatchStart?.({ index: 0, start: 0, end: 1 });
      if (abort) controller.abort();
      throw abort ? controller.signal.reason : error;
    });
    const translate = createHarnessMode(harnessPresets[0].models[0], 'key');
    await expect(
      translate({ lines: ['source'], tracker }, controller.signal),
    ).rejects.toBe(abort ? controller.signal.reason : error);
    if (abort) {
      expect(tracker.onAbort).toHaveBeenCalledOnce();
      expect(tracker.onSegError).not.toHaveBeenCalled();
    } else {
      expect(tracker.onSegError).toHaveBeenCalledWith(0, error);
      expect(tracker.onAbort).not.toHaveBeenCalled();
    }
  },
);

it('does not let late callbacks from a cancelled execution change a restarted tracker', async () => {
  const controller = new AbortController();
  let callbacks!: Parameters<typeof translateChapter>[0];
  let reject!: (error: Error) => void;
  vi.mocked(translateChapter).mockImplementationOnce((input) => {
    callbacks = input;
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  let status = 'translating';
  const tracker = {
    onAbort: vi.fn(() => {
      status = 'pending';
    }),
    onSegComplete: vi.fn(() => {
      status = 'done';
    }),
    onHarnessUsage: vi.fn(),
  };
  const translate = createHarnessMode(harnessPresets[0].models[0], 'key');
  const result = translate(
    { lines: ['source'], tracker },
    controller.signal,
  ).catch((error: unknown) => error);
  controller.abort();
  const abortCallsBeforeRestart = tracker.onAbort.mock.calls.length;
  status = 'translating';
  callbacks.onBatchComplete?.({ index: 0, start: 0, end: 1 }, ['late']);
  callbacks.onUsage?.({ model: 'test', batch: 1 } as Parameters<
    NonNullable<typeof callbacks.onUsage>
  >[0]);
  reject(new DOMException('late abort', 'AbortError'));
  await result;
  expect(abortCallsBeforeRestart).toBe(1);
  expect(status).toBe('translating');
  expect(tracker.onAbort).toHaveBeenCalledOnce();
  expect(tracker.onSegComplete).not.toHaveBeenCalled();
  expect(tracker.onHarnessUsage).not.toHaveBeenCalled();
});
