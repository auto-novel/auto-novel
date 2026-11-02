import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { Translator } from '@auto-novel/translator';

import { runTranslationTask } from '../src/domain/translator/run-task';
import type { SingleTaskTranslatorConfig } from '../src/domain/translator/run-task';
import type {
  PreparedUnit,
  TranslationTask,
} from '../src/domain/translator/tasks/task';
import type {
  TranslateTaskDesc,
  TranslateTaskParams,
} from '../src/model/Translator';

const mocks = vi.hoisted(() => ({
  createTranslator: vi.fn(),
  createTranslationTask: vi.fn(),
}));

vi.mock('@auto-novel/translator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@auto-novel/translator')>()),
  createTranslator: mocks.createTranslator,
}));
vi.mock('@/external/translator', () => ({
  createYoudaoTranslator: mocks.createTranslator,
}));
vi.mock('@/domain/translator/tasks/create-task', () => ({
  createTranslationTask: mocks.createTranslationTask,
}));
vi.mock('@/domain/translator/segment-cache', () => ({
  IndexedDbSegmentCache: class {
    async get() {
      return undefined;
    }
    async set() {}
  },
}));

const desc: TranslateTaskDesc = {
  type: 'web',
  providerId: 'provider',
  novelId: 'novel',
};
const params: TranslateTaskParams = {
  level: 'normal',
  forceMetadata: false,
  useBrowserCrawler: false,
  startIndex: 0,
  endIndex: 10,
};
const sakura: SingleTaskTranslatorConfig = {
  id: 'sakura',
  endpoint: 'http://localhost:8080',
  segLength: 500,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function callbacks() {
  return {
    onProgressUpdated: vi.fn(),
    onChapterSaved: vi.fn(),
    log: vi.fn(),
  };
}

function createTask(type: TranslationTask['type'] = 'web') {
  const saves = [
    vi.fn<PreparedUnit['save']>().mockResolvedValue({ jp: 5, zh: 3 }),
    vi.fn<PreparedUnit['save']>().mockResolvedValue({ zh: 4 }),
  ];
  const task = {
    type,
    initialized: false,
    chapters: ['1', '2'].map((chapterId, order) => ({
      kind: 'chapter' as const,
      chapterId,
      title: `Chapter ${chapterId}`,
      order,
      completed: false,
    })),
    metadataUnit: undefined as TranslationTask['metadataUnit'],
    initialize: vi.fn<TranslationTask['initialize']>(),
    prepareUnit: vi.fn<TranslationTask['prepareUnit']>(),
  } satisfies TranslationTask;
  task.initialize.mockImplementation(async ({ signal }) => {
    signal.throwIfAborted();
    task.initialized = true;
  });
  task.prepareUnit.mockImplementation(async (unit) => ({
    lines: [`原文${unit.kind === 'chapter' ? unit.chapterId : '信息'}`],
    glossary: {},
    save: saves[unit.kind === 'chapter' ? Number(unit.chapterId) - 1 : 0],
  }));
  mocks.createTranslationTask.mockReturnValue(task);
  return { task, saves };
}

let translator: Translator;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('reactive', reactive);
  translator = {
    trusted: true,
    translate: vi
      .fn<Translator['translate']>()
      .mockImplementation(async ({ lines }) =>
        lines.map((line) => `译文:${line}`),
      ),
  };
  mocks.createTranslator.mockResolvedValue(translator);
});

afterEach(() => vi.unstubAllGlobals());

describe('runTranslationTask', () => {
  it('waits for each save before preparing the next unit, skips completed chapters and reports saved counts', async () => {
    const { task, saves } = createTask();
    task.chapters.push({
      kind: 'chapter',
      chapterId: '3',
      title: 'Already translated',
      order: 2,
      completed: true,
    });
    const saving = deferred<void>();
    saves[0].mockImplementation(async () => {
      await saving.promise;
      return { jp: 5, zh: 3 };
    });
    const cb = callbacks();
    const running = runTranslationTask(desc, params, { id: 'youdao' }, cb);
    await vi.waitFor(() => expect(saves[0]).toHaveBeenCalledOnce());
    expect(task.prepareUnit).toHaveBeenCalledOnce();
    expect(cb.onChapterSaved).not.toHaveBeenCalled();
    saving.resolve();

    await expect(running).resolves.toBe('complete');
    expect(mocks.createTranslationTask).toHaveBeenCalledWith(
      desc,
      'youdao',
      params,
    );
    expect(task.initialize).toHaveBeenCalledOnce();
    expect(task.prepareUnit.mock.calls.map(([unit]) => unit)).toEqual([
      { kind: 'chapter', chapterId: '1' },
      { kind: 'chapter', chapterId: '2' },
    ]);
    expect(saves[0]).toHaveBeenCalledWith(['译文:原文1']);
    expect(saves[1]).toHaveBeenCalledWith(['译文:原文2']);
    expect(cb.onChapterSaved.mock.calls).toEqual([
      [{ jp: 5, zh: 3 }],
      [{ zh: 4 }],
    ]);
    expect(cb.onProgressUpdated).toHaveBeenLastCalledWith({
      finished: 3,
      error: 0,
      total: 3,
    });
  });

  it('does not report complete or chapter counts for a failed metadata-only task', async () => {
    const { task } = createTask();
    task.chapters = [];
    task.metadataUnit = { kind: 'metadata', title: '小说信息' };
    const save = vi
      .fn<PreparedUnit['save']>()
      .mockRejectedValue(new Error('metadata save failed'));
    task.prepareUnit.mockResolvedValue({ lines: [], glossary: {}, save });
    const cb = callbacks();

    await expect(runTranslationTask(desc, params, sakura, cb)).resolves.toBe(
      'uncomplete',
    );
    expect(save).toHaveBeenCalledWith([]);
    expect(cb.onChapterSaved).not.toHaveBeenCalled();
    expect(cb.onProgressUpdated).toHaveBeenCalled();
    for (const [progress] of cb.onProgressUpdated.mock.calls) {
      expect(progress).toEqual({ finished: 0, error: 0, total: 0 });
    }
    expect(translator.translate).not.toHaveBeenCalled();
  });

  it('continues with later chapters after a save failure without reporting failed counts', async () => {
    const { saves } = createTask();
    saves[0].mockRejectedValue(new Error('upload failed'));
    const cb = callbacks();

    await expect(runTranslationTask(desc, params, sakura, cb)).resolves.toBe(
      'uncomplete',
    );
    expect(saves[1]).toHaveBeenCalledWith(['译文:原文2']);
    expect(cb.onChapterSaved.mock.calls).toEqual([[{ zh: 4 }]]);
    expect(cb.onProgressUpdated).toHaveBeenLastCalledWith({
      finished: 1,
      error: 1,
      total: 2,
    });
  });

  it('aborts an in-flight translation without saving its late result or preparing another chapter', async () => {
    const { task, saves } = createTask();
    const result = deferred<readonly string[]>();
    vi.mocked(translator.translate).mockReturnValue(result.promise);
    const cb = callbacks();
    const controller = new AbortController();
    const running = runTranslationTask(
      desc,
      params,
      sakura,
      cb,
      controller.signal,
    );
    await vi.waitFor(() => expect(translator.translate).toHaveBeenCalledOnce());
    controller.abort();
    await expect(running).resolves.toBe('abort');
    result.resolve(['迟到译文']);
    await result.promise;
    expect(task.prepareUnit).toHaveBeenCalledOnce();
    expect(saves[0]).not.toHaveBeenCalled();
    expect(saves[1]).not.toHaveBeenCalled();
    expect(cb.onChapterSaved).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'web' as const, trusted: false, segLength: 500 },
    { type: 'wenku' as const, trusted: true, segLength: 1000 },
  ])(
    'rejects remote $type work when trusted=$trusted and segLength=$segLength',
    async ({ type, trusted, segLength }) => {
      const { task } = createTask(type);
      mocks.createTranslator.mockResolvedValue({
        ...translator,
        trusted,
        untrustedReason: 'unsupported model',
      });
      const remoteDesc: TranslateTaskDesc =
        type === 'web'
          ? desc
          : { type: 'wenku', novelId: 'novel', volumeId: 'volume' };
      const cb = callbacks();

      await expect(
        runTranslationTask(remoteDesc, params, { ...sakura, segLength }, cb),
      ).resolves.toBe('uncomplete');
      expect(task.initialize).not.toHaveBeenCalled();
      expect(task.prepareUnit).not.toHaveBeenCalled();
      expect(translator.translate).not.toHaveBeenCalled();
      expect(cb.onChapterSaved).not.toHaveBeenCalled();
    },
  );

  it('allows an untrusted translator and nonstandard segment length for local work', async () => {
    const { saves } = createTask('local');
    mocks.createTranslator.mockResolvedValue({ ...translator, trusted: false });
    const localDesc: TranslateTaskDesc = { type: 'local', volumeId: 'volume' };

    await expect(
      runTranslationTask(
        localDesc,
        params,
        { ...sakura, segLength: 1000 },
        callbacks(),
      ),
    ).resolves.toBe('complete');
    expect(saves[0]).toHaveBeenCalledWith(['译文:原文1']);
    expect(saves[1]).toHaveBeenCalledWith(['译文:原文2']);
  });

  it.each(['translator creation', 'task creation', 'initialization'])(
    'returns uncomplete on %s failure before preparing work',
    async (stage) => {
      const { task } = createTask();
      const error = new Error(stage);
      if (stage === 'translator creation')
        mocks.createTranslator.mockRejectedValue(error);
      else if (stage === 'task creation')
        mocks.createTranslationTask.mockImplementation(() => {
          throw error;
        });
      else task.initialize.mockRejectedValue(error);
      const cb = callbacks();

      await expect(runTranslationTask(desc, params, sakura, cb)).resolves.toBe(
        'uncomplete',
      );
      expect(task.prepareUnit).not.toHaveBeenCalled();
      expect(cb.onChapterSaved).not.toHaveBeenCalled();
    },
  );
});
