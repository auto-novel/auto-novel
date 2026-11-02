import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { EffectScope } from 'vue';

import type {
  ChapterDetail,
  TranslationTask,
} from '../src/domain/translator/TranslationTask/types';
import type { TranslationWork } from '@auto-novel/translator';
import { useWorkspaceRuntime } from '../src/pages/workspace/useWorkspaceRuntime';

const mocks = vi.hoisted(() => ({
  store: null as unknown,
  tasks: new Map<string, TranslationTask>(),
  submitted: [] as TranslationWork[],
  blockRemote: false,
}));

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  return { ...vue, onUnmounted: vue.onScopeDispose };
});

vi.mock('@/stores', () => ({ useWorkspaceStore: () => mocks.store }));
vi.mock('@novelia/web-kit', () => ({ Toast: { error: vi.fn() } }));
vi.mock('@/domain/translator/IndexedDbSegmentCache', () => ({
  IndexedDbSegmentCache: class {},
}));
vi.mock('@/domain/translator/TranslationTask/createTranslationTask', () => ({
  createTranslationTask: (desc: string) => mocks.tasks.get(desc),
}));
vi.mock('@/model/Translator', () => ({
  toTranslatorConfig: (_id: string, worker: object) => worker,
  TranslateTaskDescriptor: { parse: (desc: string) => ({ desc, params: {} }) },
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
      await work.onComplete({ lines: ['译文'], failed: [] });
    }
  },
}));

function task(type: TranslationTask['type']): TranslationTask {
  return {
    type,
    description: type,
    level: 'normal',
    initialized: true,
    chapters: [
      { chapterId: '1', title: 'chapter', order: 0, status: 'pending' },
    ],
    glossary: {},
    glossaryId: '',
    initMeta: vi.fn(),
    fetchChapter: vi.fn().mockResolvedValue({
      paragraphs: ['原文'],
      glossary: {},
      glossaryId: '',
    }),
    uploadChapter: vi.fn(),
    needsPreparation: type === 'web',
    prepareExecution: vi.fn().mockResolvedValue(undefined),
    needsMetadata: type === 'web',
    translateMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

const runtimeScopes: EffectScope[] = [];
afterEach(() => {
  runtimeScopes.splice(0).forEach((scope) => scope.stop());
  mocks.blockRemote = false;
});

function createRuntime() {
  const scope = effectScope();
  runtimeScopes.push(scope);
  return scope.run(() => useWorkspaceRuntime('sakura'))!;
}

async function setupLifecycleRuntime(tasks: Record<string, TranslationTask>) {
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
      workers: [{ id: 'trusted', trusted: true }],
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
  it('cancels initialization and active chapters when the workspace is disposed', async () => {
    const active = task('local');
    const initializing = task('local');
    initializing.initialized = false;
    const source = deferred<ChapterDetail>();
    const metadata = deferred<void>();
    vi.mocked(active.fetchChapter).mockReturnValueOnce(source.promise);
    vi.mocked(initializing.initMeta).mockReturnValueOnce(metadata.promise);
    const { runtime } = await setupLifecycleRuntime({ active, initializing });
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(active.fetchChapter).toHaveBeenCalledOnce());
    const inputSignal = vi.mocked(active.fetchChapter).mock.calls[0][1]!.signal;
    const initializationSignal = vi.mocked(initializing.initMeta).mock
      .calls[0][0]!;

    runtimeScopes[runtimeScopes.length - 1].stop();
    expect(inputSignal.aborted).toBe(true);
    expect(initializationSignal.aborted).toBe(true);
    source.resolve({ paragraphs: ['迟到原文'], glossary: {}, glossaryId: '' });
    metadata.resolve();
    await Promise.all([source.promise, metadata.promise]);
    await Promise.resolve();
    expect(active.uploadChapter).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.has('initializing')).toBe(false);
  });
  it('synchronously cancels a deleted task and ignores its late source', async () => {
    const old = task('local');
    const other = task('local');
    const source = deferred<ChapterDetail>();
    vi.mocked(old.fetchChapter).mockReturnValueOnce(source.promise);
    const { runtime } = await setupLifecycleRuntime({ old, other });
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(old.fetchChapter).toHaveBeenCalledOnce());
    const signal = vi.mocked(old.fetchChapter).mock.calls[0][1]!.signal;
    runtime.deleteJob('old');
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(other.uploadChapter).toHaveBeenCalledOnce());
    source.resolve({ paragraphs: ['迟到原文'], glossary: {}, glossaryId: '' });
    await source.promise;
    await Promise.resolve();
    expect(old.uploadChapter).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.has('old')).toBe(false);
  });

  it('preserves a version across sorting/snapshot replacement but cancels queued work on a version change', async () => {
    const old = task('wenku');
    const other = task('local');
    const replacement = task('wenku');
    const { runtime, store } = await setupLifecycleRuntime({ old, other });
    mocks.blockRemote = true;
    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
    const oldWork = mocks.submitted[0];
    const signal = vi.mocked(old.fetchChapter).mock.calls[0][1]!.signal;
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
    expect(old.fetchChapter).toHaveBeenCalledOnce();

    mocks.tasks.set('old', replacement);
    mocks.blockRemote = false;
    store.ref.value.jobs.find((job) => job.task === 'old')!.createAt = 2;
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(replacement.uploadChapter).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(other.uploadChapter).toHaveBeenCalledOnce());
    await expect(
      oldWork.onComplete({ lines: ['迟到译文'], failed: [] }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(old.uploadChapter).not.toHaveBeenCalled();
    expect(runtime.taskStates.value.get('old')?.chapters[0].status).toBe(
      'done',
    );
  });

  it.each(['initialization', 'preparation', 'metadata'] as const)(
    'cancels %s when a task is removed by another tab',
    async (phase) => {
      const old = task('web');
      const other = task('local');
      const pending = deferred<void>();
      let signal!: AbortSignal;
      if (phase === 'initialization') {
        old.initialized = false;
        vi.mocked(old.initMeta).mockImplementation(async (inputSignal) => {
          signal = inputSignal!;
          await pending.promise;
          old.initialized = true;
        });
      } else if (phase === 'preparation') {
        vi.mocked(old.prepareExecution!).mockImplementation(async (context) => {
          signal = context.signal;
          await pending.promise;
        });
      } else {
        Object.defineProperty(old, 'needsPreparation', { value: false });
        old.chapters.length = 0;
        vi.mocked(old.translateMetadata!).mockImplementation(
          async (_translate, inputSignal) => {
            signal = inputSignal!;
            await pending.promise;
          },
        );
      }
      const { runtime, store } = await setupLifecycleRuntime({ old, other });
      await runtime.startWorker('trusted');
      await vi.waitFor(() => expect(signal).toBeDefined());
      store.ref.value.jobs = store.ref.value.jobs.filter(
        (job) => job.task !== 'old',
      );
      expect(signal.aborted).toBe(true);
      await vi.waitFor(() =>
        expect(other.uploadChapter).toHaveBeenCalledOnce(),
      );
      pending.resolve();
      await pending.promise;
      await Promise.resolve();
      expect(runtime.taskStates.value.has('old')).toBe(false);
      expect(old.uploadChapter).not.toHaveBeenCalled();
    },
  );
});

describe('workspace trusted worker scheduling', () => {
  it('releases an uncancellable fetch and ignores its late rejection after restarting', async () => {
    const remote = task('wenku');
    const local = task('local');
    let reject!: (error: unknown) => void;
    const pending = new Promise<ChapterDetail>((_, rej) => {
      reject = rej;
    });
    vi.mocked(remote.fetchChapter).mockImplementationOnce(() => pending);
    mocks.tasks = new Map([
      ['remote', remote],
      ['local', local],
    ]);
    mocks.submitted = [];
    mocks.blockRemote = false;
    mocks.store = {
      ref: ref({
        jobs: ['remote', 'local'].map((name) => ({
          task: name,
          description: name,
          createAt: 1,
        })),
        workers: [
          { id: 'trusted', trusted: true },
          { id: 'untrusted', trusted: false },
        ],
      }),
    };
    const runtime = createRuntime();

    await runtime.startWorker('trusted');
    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(remote.fetchChapter).toHaveBeenCalledOnce());
    runtime.stopWorker('trusted');
    // The plugin promise is deliberately unresolved; local work must still finish.
    await vi.waitFor(() => expect(local.uploadChapter).toHaveBeenCalledOnce());
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'pending',
    );
    expect(remote.uploadChapter).not.toHaveBeenCalled();

    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(remote.uploadChapter).toHaveBeenCalledOnce());
    reject(new Error('late plugin failure'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'done',
    );
    expect(remote.uploadChapter).toHaveBeenCalledOnce();
    expect(remote.fetchChapter).toHaveBeenCalledTimes(2);
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      false,
      true,
    ]);
  });
  it('cancels a blocked remote input when the last trusted worker stops and continues local work', async () => {
    const remote = task('wenku');
    const local = task('local');
    mocks.tasks = new Map([
      ['remote', remote],
      ['local', local],
    ]);
    mocks.submitted = [];
    mocks.blockRemote = true;
    mocks.store = {
      ref: ref({
        jobs: ['remote', 'local'].map((name) => ({
          task: name,
          description: name,
          createAt: 1,
        })),
        workers: [
          { id: 'trusted', trusted: true },
          { id: 'untrusted', trusted: false },
        ],
      }),
    };
    const runtime = createRuntime();

    await runtime.startWorker('trusted');
    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
    expect(mocks.submitted[0].trustedOnly).toBe(true);
    runtime.stopWorker('trusted');

    await vi.waitFor(() => expect(local.uploadChapter).toHaveBeenCalledOnce());
    expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
      'pending',
    );
    expect(remote.uploadChapter).not.toHaveBeenCalled();
    expect(remote.fetchChapter).toHaveBeenCalledOnce();
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      true,
      false,
    ]);
    expect(runtime.workerStates.value.get('untrusted')?.running).toBe(true);
  });
  it('skips remote tasks and their preparation/metadata while continuing local work, then resumes remote work with a trusted worker', async () => {
    const web = task('web');
    const wenku = task('wenku');
    const local = task('local');
    // This remote job has metadata but needs no preparation.
    Object.defineProperty(web, 'needsPreparation', { value: false });
    const preparing = task('web');
    mocks.tasks = new Map([
      ['web', web],
      ['wenku', wenku],
      ['preparing', preparing],
      ['local', local],
    ]);
    mocks.submitted = [];
    mocks.blockRemote = false;
    mocks.store = {
      ref: ref({
        jobs: ['web', 'wenku', 'preparing', 'local'].map((name) => ({
          task: name,
          description: name,
          createAt: 1,
        })),
        workers: [
          { id: 'untrusted', trusted: false },
          { id: 'trusted', trusted: true },
        ],
      }),
    };
    const runtime = createRuntime();

    await runtime.startWorker('untrusted');
    await vi.waitFor(() => expect(local.uploadChapter).toHaveBeenCalledOnce());
    expect(web.fetchChapter).not.toHaveBeenCalled();
    expect(wenku.fetchChapter).not.toHaveBeenCalled();
    expect(preparing.prepareExecution).not.toHaveBeenCalled();
    expect(web.translateMetadata).not.toHaveBeenCalled();
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([false]);

    await runtime.startWorker('trusted');
    await vi.waitFor(() => expect(wenku.uploadChapter).toHaveBeenCalledOnce());
    expect(web.uploadChapter).toHaveBeenCalledOnce();
    expect(preparing.prepareExecution).toHaveBeenCalledOnce();
    expect(web.translateMetadata).toHaveBeenCalledOnce();
    expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
      false,
      true,
      true,
    ]);
  });
});
