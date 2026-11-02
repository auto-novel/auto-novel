import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { EffectScope } from 'vue';

import type {
  PreparedUnit,
  TranslationTask,
} from '../src/domain/translator/TranslationTask/types';
import type { TranslationWork } from '@auto-novel/translator';
import { useWorkspaceRuntime } from '../src/pages/workspace/useWorkspaceRuntime';

const mocks = vi.hoisted(() => ({
  store: null as unknown,
  tasks: new Map<string, TranslationTask>(),
  submitted: [] as TranslationWork[],
  blockRemote: false,
  failMetadata: false,
  parseTask: vi.fn((desc: string) => ({ desc, params: {} })),
  clearCache: vi.fn<(storeName: string) => Promise<void>>(),
}));

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return { ...vue, onUnmounted: vue.onScopeDispose };
});

vi.mock('@/stores', () => ({ useWorkspaceStore: () => mocks.store }));
vi.mock('@novelia/web-kit', () => ({ Toast: { error: vi.fn() } }));
vi.mock('@/domain/translator/IndexedDbSegmentCache', () => ({
  IndexedDbSegmentCache: class {
    constructor(readonly storeName: string) {}
    clear() {
      return mocks.clearCache(this.storeName);
    }
  },
}));
vi.mock('@/domain/translator/TranslationTask/createTranslationTask', () => ({
  createTranslationTask: (desc: string) => mocks.tasks.get(desc),
}));
vi.mock('@/model/Translator', () => ({
  toTranslatorConfig: (_id: string, worker: object) => worker,
  TranslateTaskDescriptor: { parse: mocks.parseTask },
}));
vi.mock('@/pages/workspace/useWorkspaceLog', () => ({
  useWorkspaceLog: () => ({ logs: [], appendLog: vi.fn(), clearLogs: vi.fn() }),
}));
vi.mock('@auto-novel/translator', () => ({
  createTranslator: async (config: { trusted: boolean }) => ({
    trusted: config.trusted,
  }),
  TranslationPipeline: class {
    registerTranslator() {}
    unregisterTranslator() {}
    dispose() {}
    async drain() {}
    async submit(work: TranslationWork, signal: AbortSignal) {
      mocks.submitted.push(work);
      if (mocks.blockRemote && work.trustedOnly) {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener('abort', () => resolve(), { once: true });
        });
        await work.onAbort();
        signal.throwIfAborted();
      }
      if (mocks.failMetadata && work.lines[0] === '元数据') {
        await work.onError(new Error('metadata failed'));
      } else {
        await work.onComplete({ lines: ['译文'], failed: [] });
      }
    }
  },
}));

type MutableTaskState = { initialized: boolean };

function task(type: TranslationTask['type']) {
  const chapterSave = vi.fn();
  const metadataSave = vi.fn();
  return {
    type,
    initialized: false as boolean,
    chapters: [
      {
        kind: 'chapter',
        chapterId: '1',
        title: 'chapter',
        order: 0,
        completed: false,
      },
    ],
    initialize: vi
      .fn<TranslationTask['initialize']>()
      .mockImplementation(async function (this: MutableTaskState) {
        this.initialized = true;
      }),
    chapterSave,
    metadataSave,
    prepareUnit: vi
      .fn<TranslationTask['prepareUnit']>()
      .mockImplementation(async (unit) => ({
        lines: [unit.kind === 'metadata' ? '元数据' : '原文'],
        glossary: {},
        save: unit.kind === 'metadata' ? metadataSave : chapterSave,
      })),
    metadataUnit:
      type === 'web'
        ? {
            kind: 'metadata',
            title: '小说信息',
          }
        : undefined,
  } satisfies TranslationTask & {
    chapterSave: typeof chapterSave;
    metadataSave: typeof metadataSave;
  };
}

function metadataPreparations(task: TranslationTask) {
  return vi
    .mocked(task.prepareUnit)
    .mock.calls.filter(([unit]) => unit.kind === 'metadata');
}

const runtimeScopes: EffectScope[] = [];
afterEach(() => {
  runtimeScopes.splice(0).forEach((scope) => scope.stop());
  mocks.blockRemote = false;
  mocks.failMetadata = false;
  vi.restoreAllMocks();
});

function createRuntime(translatorId: 'sakura' | 'gpt' = 'sakura') {
  const scope = effectScope();
  runtimeScopes.push(scope);
  return scope.run(() => useWorkspaceRuntime(translatorId))!;
}

it.each(['sakura', 'gpt'] as const)(
  'clears only the %s workspace cache and propagates failures',
  async (translatorId) => {
    mocks.store = { ref: ref({ jobs: [], workers: [] }) };
    const runtime = createRuntime(translatorId);
    mocks.clearCache.mockReset().mockResolvedValue(undefined);
    await expect(runtime.clearTranslationCache()).resolves.toBeUndefined();
    expect(mocks.clearCache).toHaveBeenCalledExactlyOnceWith(
      `${translatorId}-seg-cache`,
    );

    const error = new Error('cache unavailable');
    mocks.clearCache.mockRejectedValueOnce(error);
    await expect(runtime.clearTranslationCache()).rejects.toBe(error);
  },
);

function setupLifecycleRuntime(
  tasks: Record<string, TranslationTask>,
  workers = [{ id: 'trusted', trusted: true }],
) {
  mocks.tasks = new Map(Object.entries(tasks));
  mocks.submitted = [];
  mocks.blockRemote = false;
  const store = {
    ref: ref({
      jobs: Object.keys(tasks).map((name) => ({
        task: name,
        description: name,
        createAt: 1,
      })),
      workers,
    }),
    deleteJob: (name: string) => {
      store.ref.value.jobs = store.ref.value.jobs.filter(
        (job) => job.task !== name,
      );
    },
  };
  mocks.store = store;
  const runtime = createRuntime();
  return { runtime, store };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('workspace task version lifecycle', () => {
  it('cancels initialization when disposed without eagerly loading the next task', async () => {
    const active = task('local');
    const initializing = task('local');
    const metadata = deferred<void>();
    vi.mocked(initializing.initialize).mockReturnValueOnce(metadata.promise);
    const { runtime } = setupLifecycleRuntime({ initializing, active });
    await runtime.startWorker('trusted');
    await vi.waitFor(() =>
      expect(initializing.initialize).toHaveBeenCalledOnce(),
    );
    expect(active.prepareUnit).not.toHaveBeenCalled();
    const initializationSignal = vi.mocked(initializing.initialize).mock
      .calls[0][0]!.signal;

    runtimeScopes[runtimeScopes.length - 1].stop();
    expect(initializationSignal.aborted).toBe(true);
    metadata.resolve();
    await metadata.promise;
    await Promise.resolve();
    expect(active.chapterSave).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.has('initializing')).toBe(false);
  });
  it('synchronously cancels a deleted task and ignores its late source', async () => {
    const old = task('local');
    const other = task('local');
    const source = deferred<PreparedUnit>();
    vi.mocked(old.prepareUnit).mockReturnValueOnce(source.promise);
    const { runtime } = setupLifecycleRuntime({ old, other });
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(old.prepareUnit).toHaveBeenCalledOnce());
    const signal = vi.mocked(old.prepareUnit).mock.calls[0][1]!.signal;
    runtime.deleteJob('old');
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(other.chapterSave).toHaveBeenCalledOnce());
    source.resolve({
      lines: ['迟到原文'],
      glossary: {},
      save: old.chapterSave,
    });
    await source.promise;
    await Promise.resolve();
    expect(old.chapterSave).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.has('old')).toBe(false);
  });

  it('preserves a version across sorting/snapshot replacement but cancels queued work on a version change', async () => {
    const old = task('wenku');
    const other = task('local');
    const replacement = task('wenku');
    const { runtime, store } = setupLifecycleRuntime({ old, other });
    mocks.blockRemote = true;
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
    const oldWork = mocks.submitted[0];
    const signal = vi.mocked(old.prepareUnit).mock.calls[0][1]!.signal;
    const oldState = runtime.taskStates.value.get('old');
    store.ref.value.jobs = [...store.ref.value.jobs].sort((a, b) =>
      b.task.localeCompare(a.task),
    );
    store.ref.value = {
      ...store.ref.value,
      jobs: store.ref.value.jobs.map((job) => ({ ...job })),
    };
    expect(signal.aborted).toBe(false);
    expect(runtime.taskStates.value.get('old')).toBe(oldState);
    expect(old.prepareUnit).toHaveBeenCalledOnce();

    mocks.tasks.set('old', replacement);
    mocks.blockRemote = false;
    store.ref.value.jobs.find((job) => job.task === 'old')!.createAt = 2;
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(replacement.chapterSave).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(other.chapterSave).toHaveBeenCalledOnce());
    await expect(
      oldWork.onComplete({ lines: ['迟到译文'], failed: [] }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(old.chapterSave).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.get('old')?.chapters[0].status).toBe(
      'done',
    );
  });

  it.each(['initialization', 'metadata'] as const)(
    'cancels %s when a task is removed by another tab',
    async (phase) => {
      const old = task('web');
      const other = task('local');
      const pending = deferred<void>();
      let signal!: AbortSignal;
      if (phase === 'initialization') {
        old.initialized = false;
        vi.mocked(old.initialize).mockImplementation(async (context) => {
          signal = context.signal;
          await pending.promise;
          old.initialized = true;
        });
      } else {
        old.chapters.length = 0;
        vi.mocked(old.prepareUnit).mockImplementation(
          async (_unit, context) => {
            signal = context.signal;
            await pending.promise;
            return { lines: ['元数据'], glossary: {}, save: vi.fn() };
          },
        );
      }
      const { runtime, store } = setupLifecycleRuntime({ old, other });
      await runtime.startWorker('trusted');
      await vi.waitFor(() => expect(signal).toBeDefined());
      store.ref.value.jobs = store.ref.value.jobs.filter(
        (job) => job.task !== 'old',
      );
      expect(signal.aborted).toBe(true);
      await vi.waitFor(() => expect(other.chapterSave).toHaveBeenCalledOnce());
      pending.resolve();
      await pending.promise;
      await Promise.resolve();
      expect(runtime.taskStates.value.has('old')).toBe(false);
      expect(old.chapterSave).not.toHaveBeenCalled();
    },
  );
});

describe('workspace trusted worker scheduling', () => {
  it('releases an uncancellable fetch and ignores its late rejection after restarting', async () => {
    const remote = task('wenku');
    const local = task('local');
    let reject!: (error: unknown) => void;
    const pending = new Promise<PreparedUnit>((_, rej) => {
      reject = rej;
    });
    vi.mocked(remote.prepareUnit).mockImplementationOnce(() => pending);
    const { runtime } = setupLifecycleRuntime({ remote, local }, [
      { id: 'trusted', trusted: true },
      { id: 'untrusted', trusted: false },
    ]);

    await runtime.startWorker('trusted');
    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(remote.prepareUnit).toHaveBeenCalledOnce());
    runtime.stopWorker('trusted');
    // The plugin promise is deliberately unresolved; local work must still finish.
    await vi.waitFor(() => expect(local.chapterSave).toHaveBeenCalledOnce());
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'pending',
    );
    expect(remote.chapterSave).not.toHaveBeenCalled();

    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(remote.chapterSave).toHaveBeenCalledOnce());
    reject(new Error('late plugin failure'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'done',
    );
    expect(remote.chapterSave).toHaveBeenCalledOnce();
    expect(remote.prepareUnit).toHaveBeenCalledTimes(2);
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      false,
      true,
    ]);
  });
  it('cancels a blocked remote input when the last trusted worker stops and continues local work', async () => {
    const remote = task('wenku');
    const local = task('local');
    const { runtime } = setupLifecycleRuntime({ remote, local }, [
      { id: 'trusted', trusted: true },
      { id: 'untrusted', trusted: false },
    ]);
    mocks.blockRemote = true;

    await runtime.startWorker('trusted');
    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
    expect(mocks.submitted[0].trustedOnly).toBe(true);
    runtime.stopWorker('trusted');

    await vi.waitFor(() => expect(local.chapterSave).toHaveBeenCalledOnce());
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'pending',
    );
    expect(remote.chapterSave).not.toHaveBeenCalled();
    expect(remote.prepareUnit).toHaveBeenCalledOnce();
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      true,
      false,
    ]);
    expect(runtime.workerStates.value.get('untrusted')?.running).toBe(true);
  });
  it('skips remote initialization and metadata with an untrusted worker, then resumes with a trusted worker', async () => {
    const web = task('web');
    const wenku = task('wenku');
    const local = task('local');
    const { runtime } = setupLifecycleRuntime({ web, wenku, local }, [
      { id: 'untrusted', trusted: false },
      { id: 'trusted', trusted: true },
    ]);

    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(local.chapterSave).toHaveBeenCalledOnce());
    expect(web.prepareUnit).not.toHaveBeenCalled();
    expect(wenku.prepareUnit).not.toHaveBeenCalled();
    expect(web.initialize).not.toHaveBeenCalled();
    expect(metadataPreparations(web)).toHaveLength(0);
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([false]);

    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(wenku.chapterSave).toHaveBeenCalledOnce());
    expect(web.chapterSave).toHaveBeenCalledOnce();
    expect(web.initialize).toHaveBeenCalledOnce();
    expect(metadataPreparations(web)).toHaveLength(1);
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });
});

describe('lazy task loading and metadata units', () => {
  it.each(['descriptor', 'snapshot'] as const)(
    'skips a failed %s without stopping the worker and retries on restart',
    async (phase) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failed = task('local');
      const next = task('local');
      const { runtime, store } = setupLifecycleRuntime({ failed, next });
      const error = new Error('invalid task');
      if (phase === 'descriptor') {
        mocks.parseTask.mockImplementationOnce(() => {
          throw error;
        });
      } else {
        vi.mocked(failed.initialize).mockRejectedValueOnce(error);
      }

      await runtime.startWorker('trusted');
      await vi.waitFor(() => expect(next.chapterSave).toHaveBeenCalledOnce());
      runtime.runProcessLoop();
      expect(failed.chapterSave).not.toHaveBeenCalled();
      expect(failed.initialize).toHaveBeenCalledTimes(
        phase === 'descriptor' ? 0 : 1,
      );
      expect(runtime.workerStates.value.get('trusted')?.running).toBe(true);
      expect(store.ref.value.jobs[0]).not.toHaveProperty('finishAt');

      runtime.stopWorker('trusted');
      await runtime.startWorker('trusted');
      await vi.waitFor(() => expect(failed.chapterSave).toHaveBeenCalledOnce());
      expect(next.chapterSave).toHaveBeenCalledOnce();
    },
  );

  it('loads no directories on mount and only initializes the current task after a worker starts', async () => {
    const first = task('wenku');
    const second = task('wenku');
    const { runtime } = setupLifecycleRuntime({ first, second });
    expect(first.initialize).not.toHaveBeenCalled();
    expect(second.initialize).not.toHaveBeenCalled();
    mocks.blockRemote = true;
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
    expect(first.initialize).toHaveBeenCalledOnce();
    expect(second.initialize).not.toHaveBeenCalled();
  });

  it('restarts with a new task after cancelled initialization and ignores the old result', async () => {
    const old = task('wenku');
    const replacement = task('wenku');
    const pending = deferred<void>();
    vi.mocked(old.initialize).mockImplementation(async () => {
      await pending.promise;
      old.initialized = true;
    });
    const { runtime } = setupLifecycleRuntime({ remote: old });
    await runtime.startWorker('trusted');
    runtime.runProcessLoop();
    expect(old.initialize).toHaveBeenCalledOnce();
    const signal = vi.mocked(old.initialize).mock.calls[0][0].signal;
    runtime.stopWorker('trusted');
    expect(signal.aborted).toBe(true);

    mocks.tasks.set('remote', replacement);
    await runtime.startWorker('trusted');
    await vi.waitFor(() =>
      expect(replacement.chapterSave).toHaveBeenCalledOnce(),
    );
    const state = runtime.taskStates.value.get('remote');
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(old.chapterSave).not.toHaveBeenCalled();
    expect(replacement.initialize).toHaveBeenCalledOnce();
    expect(runtime.taskStates.value.get('remote')).toBe(state);
    expect(state?.chapters[0].status).toBe('done');
  });

  it('keeps metadata errors retryable while continuing chapters and later tasks', async () => {
    const web = task('web');
    const next = task('local');
    mocks.failMetadata = true;
    const { runtime, store } = setupLifecycleRuntime({ web, next });
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(next.chapterSave).toHaveBeenCalledOnce());
    expect(web.chapterSave).toHaveBeenCalledOnce();
    expect(web.chapters[0].completed).toBe(false);
    expect(web.chapters[0]).not.toHaveProperty('status');
    expect(web.metadataUnit).toEqual({ kind: 'metadata', title: '小说信息' });
    expect(store.ref.value.jobs[0]).not.toHaveProperty('finishAt');
    const state = runtime.taskStates.value.get('web')!;
    expect(state.metadataUnit?.status).toBe('error');
    expect(state.resetFailedChapters()).toBe(true);
    mocks.failMetadata = false;
    runtime.runProcessLoop();
    await vi.waitFor(() =>
      expect(store.ref.value.jobs[0]).toHaveProperty('finishAt'),
    );
    expect(metadataPreparations(web)).toHaveLength(2);
    expect(web.chapterSave).toHaveBeenCalledOnce();
  });
});

it('returns cancelled metadata to pending and resumes it once without reloading the task', async () => {
  const web = task('web');
  web.chapters = [];
  const save = vi.fn();
  vi.mocked(web.prepareUnit).mockResolvedValue({
    lines: ['元数据'],
    glossary: {},
    save,
  });
  const { runtime, store } = setupLifecycleRuntime({ web });
  mocks.blockRemote = true;
  await runtime.startWorker('trusted');
  await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
  runtime.stopWorker('trusted');
  await vi.waitFor(() =>
    expect(runtime.taskStates.value.get('web')?.metadataUnit?.status).toBe(
      'pending',
    ),
  );
  expect(save).not.toHaveBeenCalled();
  expect(store.ref.value.jobs[0]).not.toHaveProperty('finishAt');
  mocks.blockRemote = false;
  await runtime.startWorker('trusted');
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(metadataPreparations(web)).toHaveLength(2);
  expect(web.initialize).toHaveBeenCalledOnce();
  expect(vi.mocked(web.prepareUnit).mock.calls.map(([unit]) => unit)).toEqual([
    { kind: 'metadata' },
    { kind: 'metadata' },
  ]);
  expect(web.chapterSave).not.toHaveBeenCalled();
  expect(store.ref.value.jobs[0]).toMatchObject({
    progress: { total: 0, finished: 0, error: 0 },
    finishAt: expect.any(Number),
  });
  runtime.runProcessLoop();
  await Promise.resolve();
  expect(save).toHaveBeenCalledOnce();
});
