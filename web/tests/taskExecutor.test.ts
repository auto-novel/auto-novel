import { describe, expect, it, vi } from 'vitest';

import { WorkPreparer } from '../src/domain/translator/prepare-work';
import { buildChapterList } from '../src/domain/translator/tasks/chapter-preparation';
import type {
  TranslationTask,
  TaskMetadataUnit,
} from '../src/domain/translator/tasks/task';
import {
  UnitDetailState,
  TaskState,
  type UnitStatus,
} from '../src/domain/translator/task-state';

function createTask(type: TranslationTask['type']) {
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    type,
    initialized: true as boolean,
    chapters: [
      {
        kind: 'chapter' as const,
        chapterId: '1',
        title: 'Chapter',
        order: 0,
        completed: false,
      },
    ],
    initialize: vi.fn(),
    prepareUnit: vi.fn<TranslationTask['prepareUnit']>().mockResolvedValue({
      lines: ['原文'],
      glossary: {},
      save,
    }),
    save,
  } satisfies TranslationTask & { save: typeof save };
}

function createTracker(task: TranslationTask) {
  const state = new TaskState();
  state.initialize(task.chapters, task.metadataUnit);
  return {
    state,
    onUnitStatus: vi.fn((id: string, status: UnitStatus) =>
      state.updateStatus(id, status),
    ),
    onLog: vi.fn(),
  };
}

function createMetadataTask(lines = ['原文标题']) {
  const metadataUnit: TaskMetadataUnit = {
    kind: 'metadata',
    title: '小说信息',
  };
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    ...createTask('web'),
    metadataUnit,
    prepareUnit: vi
      .fn()
      .mockResolvedValue({ lines, glossary: { 原文: '译文' }, save }),
    save,
  };
}

describe('metadata translation units', () => {
  it('shares the translation/save lifecycle without fetching chapters or changing chapter progress', async () => {
    const task = createMetadataTask();
    const tracker = createTracker(task);
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.metadataUnit!,
      tracker,
      new AbortController().signal,
    );
    expect(work).toMatchObject({
      lines: ['原文标题'],
      glossary: { 原文: '译文' },
      trustedOnly: true,
    });
    expect(task.prepareUnit).toHaveBeenCalledWith(
      { kind: 'metadata' },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onLog: tracker.onLog,
      }),
    );
    expect(tracker.state.metadataUnit?.status).toBe('translating');
    await work!.onComplete({ lines: ['译文标题'], failed: [] });
    expect(task.save).toHaveBeenCalledWith(['译文标题']);
    expect(tracker.state.metadataUnit?.status).toBe('done');
    expect(tracker.state.progress).toEqual({ finished: 0, error: 0, total: 1 });
  });

  it('saves zero-line metadata directly without producing pipeline work', async () => {
    const task = createMetadataTask([]);
    const tracker = createTracker(task);
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.metadataUnit!,
      tracker,
      new AbortController().signal,
    );
    expect(work).toBeUndefined();
    expect(task.save).toHaveBeenCalledWith([]);
    expect(tracker.state.metadataUnit?.status).toBe('done');
  });

  it('keeps failed metadata retryable and never saves original-text fallbacks', async () => {
    const task = createMetadataTask();
    const tracker = createTracker(task);
    const state = tracker.state;
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.metadataUnit!,
      tracker,
      new AbortController().signal,
    );
    await work!.onComplete({
      lines: ['原文标题'],
      failed: [{ order: 0, error: new Error('failed') }],
    });
    expect(task.save).not.toHaveBeenCalled();
    expect(state.metadataUnit?.status).toBe('error');
    expect(state.getUnitDetails(state.metadataUnit!.chapterId)).toBeDefined();
    expect(state.resetFailedUnits()).toBe(true);
    expect(state.metadataUnit?.status).toBe('pending');
    expect(state.chapters).toHaveLength(1);
    expect(state.units).toHaveLength(2);
  });

  it('records a zero-line metadata save failure', async () => {
    const task = createMetadataTask([]);
    task.save.mockRejectedValue(new Error('upload failed'));
    const tracker = createTracker(task);
    await new WorkPreparer(task).prepareUnit(
      tracker.state.metadataUnit!,
      tracker,
      new AbortController().signal,
    );
    expect(tracker.state.metadataUnit?.status).toBe('error');
    expect(tracker.state.progress).toEqual({ finished: 0, error: 0, total: 1 });
  });
});

describe('WorkPreparer trust requirements', () => {
  it.each(['local', 'web', 'wenku'] as const)(
    'sets the trust requirement for %s inputs',
    async (type) => {
      const task = createTask(type);
      const tracker = createTracker(task);
      const work = await new WorkPreparer(task).prepareUnit(
        tracker.state.chapters[0],
        tracker,
        new AbortController().signal,
      );
      expect(work?.trustedOnly).toBe(type !== 'local');
    },
  );

  it('marks a successful save done even when stopped immediately after saving', async () => {
    const task = createTask('local');
    const tracker = createTracker(task);
    const controller = new AbortController();
    task.save.mockImplementation(async () => {
      controller.abort();
    });
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      controller.signal,
    );
    await expect(
      work!.onComplete({ lines: ['译文'], failed: [] }),
    ).resolves.toBeUndefined();
    expect(task.save).toHaveBeenCalledWith(['译文']);
    expect(task.prepareUnit).toHaveBeenCalledWith(
      { kind: 'chapter', chapterId: '1' },
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'done');
    expect(tracker.state.progress).toEqual({ finished: 1, error: 0, total: 1 });
  });
});

describe('WorkPreparer prepared units', () => {
  it('saves empty chapters directly without submitting pipeline work', async () => {
    const task = createTask('local');
    task.prepareUnit.mockResolvedValue({
      lines: [],
      glossary: {},
      save: task.save,
    });
    const tracker = createTracker(task);
    const segmentTracker = new UnitDetailState('1');
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      { ...tracker, segmentTracker },
      new AbortController().signal,
    );
    expect(work).toBeUndefined();
    expect(task.save).toHaveBeenCalledWith([]);
    expect(segmentTracker.ready).toBe(true);
    expect(segmentTracker.segments).toEqual([]);
    expect(tracker.state.progress.finished).toBe(1);
  });

  it('passes task-provided history through without rebuilding it', async () => {
    const task = createTask('local');
    const history = {
      lines: ['原文'],
      translatedLines: ['旧译文'],
      glossary: {},
    };
    task.prepareUnit.mockResolvedValue({
      lines: ['原文'],
      glossary: {},
      history,
      save: task.save,
    });
    const tracker = createTracker(task);
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      new AbortController().signal,
    );
    expect(work?.history).toBe(history);
  });
});

describe('WorkPreparer preparation boundaries', () => {
  it('keeps colliding UI keys independent and dispatches only clean identities', async () => {
    const task = createMetadataTask();
    task.chapters[0].chapterId = '\u0000metadata';
    const tracker = createTracker(task);
    expect(tracker.state.metadataUnit!.chapterId).not.toBe('\u0000metadata');
    const preparer = new WorkPreparer(task);
    const signal = new AbortController().signal;
    const chapterWork = await preparer.prepareUnit(
      tracker.state.chapters[0],
      tracker,
      signal,
    );
    const metadataWork = await preparer.prepareUnit(
      tracker.state.metadataUnit!,
      tracker,
      signal,
    );
    expect(task.prepareUnit.mock.calls.map(([unit]) => unit)).toEqual([
      { kind: 'chapter', chapterId: '\u0000metadata' },
      { kind: 'metadata' },
    ]);
    await chapterWork!.onComplete({ lines: ['章节译文'], failed: [] });
    expect(tracker.state.metadataUnit?.status).toBe('translating');
    expect(tracker.state.progress).toEqual({ finished: 1, error: 0, total: 1 });
    await metadataWork!.onComplete({ lines: ['元数据译文'], failed: [] });
    expect(tracker.state.metadataUnit?.status).toBe('done');
    expect(tracker.state.progress).toEqual({ finished: 1, error: 0, total: 1 });
  });

  it('rejects an already-aborted execution before preparing input', async () => {
    const task = createTask('local');
    const tracker = createTracker(task);
    const controller = new AbortController();
    controller.abort();
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      controller.signal,
    );
    expect(work).toBeUndefined();
    expect(task.prepareUnit).not.toHaveBeenCalled();
    expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'pending');
  });

  it('uses the same required signal to prevent saving after cancellation', async () => {
    const task = createTask('local');
    const controller = new AbortController();
    const tracker = createTracker(task);
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      controller.signal,
    );
    controller.abort();
    await expect(
      work!.onComplete({ lines: ['译文'], failed: [] }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(task.save).not.toHaveBeenCalled();
  });

  it.each(['chapter', 'metadata'] as const)(
    'rejects a missing %s unit before fetching',
    async (kind) => {
      const source = createMetadataTask();
      const task = {
        ...source,
        metadataUnit: kind === 'metadata' ? undefined : source.metadataUnit,
      };
      const tracker = createTracker(task);
      const work = await new WorkPreparer(task).prepareUnit(
        { ...tracker.state.chapters[0], kind, chapterId: 'missing' },
        tracker,
        new AbortController().signal,
      );
      expect(work).toBeUndefined();
      expect(task.prepareUnit).not.toHaveBeenCalled();
      expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('missing', 'error');
    },
  );
});

describe('TaskState ownership', () => {
  it.each([
    ['normal', [false]],
    ['expire', [false, true, false]],
    ['all', [false, false, false]],
    ['sync', [false, false, false]],
  ] as const)(
    'maps %s chapter definitions to initial UI states',
    (level, expected) => {
      const items = [
        { chapterId: 'new', done: false, expired: false },
        { chapterId: 'current', done: true, expired: false },
        { chapterId: 'expired', done: true, expired: true },
      ];
      const chapters = buildChapterList(
        items,
        3,
        level,
        (item) => item.done,
        (item) => item.expired,
        (item) => ({ chapterId: item.chapterId, title: item.chapterId }),
      );
      expect(chapters.map((chapter) => chapter.completed)).toEqual(expected);
      expect(chapters.map((chapter) => chapter.order)).toEqual(
        level === 'normal' ? [3] : [3, 4, 5],
      );
      expect(chapters.every((chapter) => chapter.kind === 'chapter')).toBe(
        true,
      );
      const state = new TaskState();
      state.initialize(chapters);
      expect(state.chapters.map((chapter) => chapter.status)).toEqual(
        expected.map((completed) => (completed ? 'done' : 'pending')),
      );
    },
  );

  it('owns UI objects without mutating task definitions or another state', () => {
    const task = createMetadataTask();
    task.chapters[0].completed = true;
    Object.freeze(task.chapters[0]);
    Object.freeze(task.metadataUnit);
    const first = createTracker(task).state;
    const second = createTracker(task).state;
    expect(first.chapters[0]).not.toBe(task.chapters[0]);
    expect(first.metadataUnit).not.toBe(task.metadataUnit);
    expect(first.chapters[0].status).toBe('done');
    first.updateStatus('1', 'error');
    first.updateStatus(first.metadataUnit!.chapterId, 'done');
    expect(second.chapters[0].status).toBe('done');
    expect(second.metadataUnit?.status).toBe('pending');
    expect(task.chapters[0]).toEqual({
      kind: 'chapter',
      chapterId: '1',
      title: 'Chapter',
      order: 0,
      completed: true,
    });
    expect(task.metadataUnit).toEqual({ kind: 'metadata', title: '小说信息' });
  });

  it('shows falsy segment errors and hides stale errors once retried', () => {
    const state = new UnitDetailState('1');
    state.segments = [
      {
        status: 'done',
        lines: ['原文'],
        translatedLines: ['译文'],
        error: null,
      },
    ];
    for (const error of [0, false, '', null, undefined, { message: '失败' }]) {
      state.onSegError(0, error);
      expect(state.getSegmentError(0)).toBe(
        typeof error === 'object' && error !== null ? '失败' : String(error),
      );
    }
    state.onSegStart(0, 'worker');
    expect(state.getSegmentError(0)).toBeUndefined();
    state.onSegComplete(0, ['译文']);
    expect(state.getSegmentError(0)).toBeUndefined();
    expect(state.getSegmentError(1)).toBeUndefined();
  });

  it('initializes chapters and metadata together and resets stale segment state', () => {
    const task = createMetadataTask();
    const state = new TaskState();
    expect(state.initialized).toBe(false);
    state.initialize(task.chapters, task.metadataUnit);
    expect(state.initialized).toBe(true);
    expect(state.units.map((unit) => unit.kind)).toEqual([
      'metadata',
      'chapter',
    ]);
    state.getUnitDetails(state.metadataUnit!.chapterId);
    state.updateStatus(state.metadataUnit!.chapterId, 'error');
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 1 });
    state.updateStatus('1', 'error');
    expect(state.progress).toEqual({ finished: 0, error: 1, total: 1 });
    state.initialize([]);
    expect(state.units).toEqual([]);
    expect(state.unitDetails.size).toBe(0);
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 0 });
  });

  it('requires initialized tasks and only reports status through the tracker', async () => {
    const task = createTask('local');
    task.initialized = false;
    const tracker = {
      ...createTracker(task),
      onUnitStatus: vi.fn(),
      onLog: vi.fn(),
    };
    const work = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      new AbortController().signal,
    );
    expect(work).toBeUndefined();
    expect(task.initialize).not.toHaveBeenCalled();
    expect(task.prepareUnit).not.toHaveBeenCalled();
    expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'error');
    expect(task.chapters[0]).not.toHaveProperty('status');
    expect(task.chapters[0].completed).toBe(false);

    task.initialized = true;
    const prepared = await new WorkPreparer(task).prepareUnit(
      tracker.state.chapters[0],
      tracker,
      new AbortController().signal,
    );
    expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'translating');
    expect(task.chapters[0]).not.toHaveProperty('status');
    expect(task.chapters[0].completed).toBe(false);
    await prepared!.onComplete({ lines: ['译文'], failed: [] });
    expect(tracker.onUnitStatus).toHaveBeenLastCalledWith('1', 'done');
    expect(task.chapters[0]).not.toHaveProperty('status');
    expect(task.chapters[0].completed).toBe(false);
    expect(task.initialize).not.toHaveBeenCalled();
  });
});
