import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';

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

describe('workspace trusted worker scheduling', () => {
  it.each(['resolve', 'reject'] as const)(
    'releases an uncancellable remote fetch and ignores its late %s after restarting',
    async (outcome) => {
      const remote = task('wenku');
      const local = task('local');
      let resolve!: (detail: ChapterDetail) => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<ChapterDetail>((res, rej) => {
        resolve = res;
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
      let runtime!: ReturnType<typeof useWorkspaceRuntime>;
      await renderToString(
        createSSRApp({
          setup() {
            runtime = useWorkspaceRuntime('sakura');
            return () => h('div');
          },
        }),
      );

      try {
        await runtime.startWorker('trusted');
        await runtime.startWorker('untrusted');
        await vi.waitFor(() =>
          expect(remote.fetchChapter).toHaveBeenCalledOnce(),
        );
        runtime.stopWorker('trusted');
        // The plugin promise is deliberately unresolved; local work must still finish.
        await vi.waitFor(() =>
          expect(local.uploadChapter).toHaveBeenCalledOnce(),
        );
        expect(runtime.taskStates.value.get('remote')?.chapters[0].status).toBe(
          'pending',
        );
        expect(remote.uploadChapter).not.toHaveBeenCalled();

        await runtime.startWorker('trusted');
        await vi.waitFor(() =>
          expect(remote.uploadChapter).toHaveBeenCalledOnce(),
        );
        if (outcome === 'resolve')
          resolve({ paragraphs: ['迟到原文'], glossary: {}, glossaryId: '' });
        else reject(new Error('late plugin failure'));
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
      } finally {
        runtime.stopAllWorkers();
      }
    },
  );
  it('shares a trusted group across chapters without cancelling an active local fetch', async () => {
    const remote = task('wenku');
    remote.chapters.push({
      chapterId: '2',
      title: 'second',
      order: 1,
      status: 'pending',
    });
    const local = task('local');
    let finishLocal!: (detail: ChapterDetail) => void;
    vi.mocked(local.fetchChapter).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLocal = resolve;
        }),
    );
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
    let runtime!: ReturnType<typeof useWorkspaceRuntime>;
    await renderToString(
      createSSRApp({
        setup() {
          runtime = useWorkspaceRuntime('sakura');
          return () => h('div');
        },
      }),
    );

    try {
      await runtime.startWorker('trusted');
      await runtime.startWorker('untrusted');
      await vi.waitFor(() => expect(local.fetchChapter).toHaveBeenCalledOnce());
      const remoteSignal = vi.mocked(remote.fetchChapter).mock.calls[0][1]!
        .signal;
      expect(vi.mocked(remote.fetchChapter).mock.calls[1][1]!.signal).toBe(
        remoteSignal,
      );
      const localSignal = vi.mocked(local.fetchChapter).mock.calls[0][1]!
        .signal;
      expect(localSignal).not.toBe(remoteSignal);
      expect(remoteSignal.aborted).toBe(false);
      // Peeking for work must not consume a chapter or change its state.
      expect(remote.uploadChapter).toHaveBeenCalledTimes(2);
      expect(local.uploadChapter).not.toHaveBeenCalled();

      runtime.stopWorker('trusted');
      expect(remoteSignal.aborted).toBe(true);
      expect(localSignal.aborted).toBe(false);
      finishLocal({ paragraphs: ['原文'], glossary: {}, glossaryId: '' });
      await vi.waitFor(() =>
        expect(local.uploadChapter).toHaveBeenCalledOnce(),
      );
      runtime.stopAllWorkers();
      expect(localSignal.aborted).toBe(true);
    } finally {
      runtime.stopAllWorkers();
    }
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
    let runtime!: ReturnType<typeof useWorkspaceRuntime>;
    await renderToString(
      createSSRApp({
        setup() {
          runtime = useWorkspaceRuntime('sakura');
          return () => h('div');
        },
      }),
    );

    try {
      await runtime.startWorker('trusted');
      await runtime.startWorker('untrusted');
      await vi.waitFor(() => expect(mocks.submitted).toHaveLength(1));
      expect(mocks.submitted[0].trustedOnly).toBe(true);
      runtime.stopWorker('trusted');

      await vi.waitFor(() =>
        expect(local.uploadChapter).toHaveBeenCalledOnce(),
      );
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
    } finally {
      runtime.stopAllWorkers();
      mocks.blockRemote = false;
    }
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
    let runtime!: ReturnType<typeof useWorkspaceRuntime>;
    await renderToString(
      createSSRApp({
        setup() {
          runtime = useWorkspaceRuntime('sakura');
          return () => h('div');
        },
      }),
    );

    try {
      await runtime.startWorker('untrusted');
      await vi.waitFor(() =>
        expect(local.uploadChapter).toHaveBeenCalledOnce(),
      );
      expect(web.fetchChapter).not.toHaveBeenCalled();
      expect(wenku.fetchChapter).not.toHaveBeenCalled();
      expect(preparing.prepareExecution).not.toHaveBeenCalled();
      expect(web.translateMetadata).not.toHaveBeenCalled();
      expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([false]);

      await runtime.startWorker('trusted');
      await vi.waitFor(() =>
        expect(wenku.uploadChapter).toHaveBeenCalledOnce(),
      );
      expect(web.uploadChapter).toHaveBeenCalledOnce();
      expect(preparing.prepareExecution).toHaveBeenCalledOnce();
      expect(web.translateMetadata).toHaveBeenCalledOnce();
      expect(mocks.submitted.map((work) => work.trustedOnly)).toEqual([
        false,
        true,
        true,
      ]);
    } finally {
      runtime.stopAllWorkers();
    }
  });
});
