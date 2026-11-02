import { describe, expect, it, vi } from 'vitest';

import { TaskExecutor } from '../src/domain/translator/TaskExecutor';
import type { TranslationTask } from '../src/domain/translator/TranslationTask/types';
import {
  ChapterSegmentState,
  TaskState,
  type ChapterMeta,
  type ChapterStatus,
} from '../src/domain/translator/TaskState';

function createTask(type: TranslationTask['type']) {
  return {
    type,
    description: 'test',
    level: 'normal' as const,
    initialized: true as boolean,
    chapters: [
      {
        chapterId: '1',
        title: 'Chapter',
        order: 0,
        status: 'pending' as const,
      },
    ],
    glossary: {},
    glossaryId: '',
    initialize: vi.fn(),
    fetchChapter: vi.fn().mockResolvedValue({
      paragraphs: ['原文'],
      glossary: {},
      glossaryId: 'glossary',
    }),
    uploadChapter: vi.fn(),
  } satisfies TranslationTask;
}

function createTracker(task: TranslationTask) {
  const state = new TaskState('test');
  state.initialize(task.chapters, task.metadataUnit);
  return {
    state,
    onChapterStatus: vi.fn((id: string, status: ChapterStatus) =>
      state.updateStatus(id, status),
    ),
    onLog: vi.fn(),
  };
}

function createMetadataTask(lines = ['原文标题']) {
  const metadataUnit: ChapterMeta = {
    kind: 'metadata',
    chapterId: '\u0000metadata',
    title: '小说信息',
    order: -1,
    status: 'pending',
  };
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    ...createTask('web'),
    metadataUnit,
    prepareMetadata: vi
      .fn()
      .mockResolvedValue({ lines, glossary: { 原文: '译文' }, save }),
    save,
  };
}

describe('metadata translation units', () => {
  it('shares the translation/save lifecycle without fetching chapters or changing chapter progress', async () => {
    const task = createMetadataTask();
    const tracker = createTracker(task);
    const work = await new TaskExecutor(task).prepareUnit(
      task.metadataUnit,
      tracker,
    );
    expect(work).toMatchObject({
      lines: ['原文标题'],
      glossary: { 原文: '译文' },
      trustedOnly: true,
    });
    expect(task.fetchChapter).not.toHaveBeenCalled();
    expect(task.metadataUnit.status).toBe('translating');
    await work!.onComplete({ lines: ['译文标题'], failed: [] });
    expect(task.save).toHaveBeenCalledWith(['译文标题']);
    expect(task.metadataUnit.status).toBe('done');
    expect(task.uploadChapter).not.toHaveBeenCalled();
    expect(tracker.state.progress).toEqual({ finished: 0, error: 0, total: 1 });
  });

  it('saves zero-line metadata directly without producing pipeline work', async () => {
    const task = createMetadataTask([]);
    const work = await new TaskExecutor(task).prepareUnit(
      task.metadataUnit,
      createTracker(task),
    );
    expect(work).toBeUndefined();
    expect(task.save).toHaveBeenCalledWith([]);
    expect(task.metadataUnit.status).toBe('done');
  });

  it('keeps failed metadata retryable and never saves original-text fallbacks', async () => {
    const task = createMetadataTask();
    const tracker = createTracker(task);
    const state = tracker.state;
    const work = await new TaskExecutor(task).prepareUnit(
      task.metadataUnit,
      tracker,
    );
    await work!.onComplete({
      lines: ['原文标题'],
      failed: [{ order: 0, error: new Error('failed') }],
    });
    expect(task.save).not.toHaveBeenCalled();
    expect(state.getStatus(task.metadataUnit.chapterId)).toBe('error');
    expect(state.getChapterState(task.metadataUnit.chapterId)).toBeDefined();
    expect(state.resetFailedChapters()).toBe(true);
    expect(state.getStatus(task.metadataUnit.chapterId)).toBe('pending');
    expect(state.chapters).toHaveLength(1);
    expect(state.units).toHaveLength(2);
  });

  it('records a zero-line metadata save failure', async () => {
    const task = createMetadataTask([]);
    task.save.mockRejectedValue(new Error('upload failed'));
    const tracker = createTracker(task);
    await new TaskExecutor(task).prepareUnit(task.metadataUnit, tracker);
    expect(task.metadataUnit.status).toBe('error');
    expect(tracker.state.progress).toEqual({ finished: 0, error: 0, total: 1 });
  });
});

describe('TaskExecutor trust requirements', () => {
  it.each(['local', 'web', 'wenku'] as const)(
    'sets the trust requirement for %s inputs',
    async (type) => {
      const task = createTask(type);
      const tracker = createTracker(task);
      const work = await new TaskExecutor(task).prepareUnit(
        task.chapters[0],
        tracker,
      );
      expect(work?.trustedOnly).toBe(type !== 'local');
    },
  );

  it('marks a successful save done even when stopped immediately after saving', async () => {
    const task = createTask('local');
    const tracker = createTracker(task);
    const controller = new AbortController();
    task.uploadChapter.mockImplementation(async () => {
      controller.abort();
    });
    const work = await new TaskExecutor(task).prepareUnit(
      task.chapters[0],
      tracker,
      controller.signal,
    );
    await expect(
      work!.onComplete({ lines: ['译文'], failed: [] }),
    ).resolves.toBeUndefined();
    expect(task.uploadChapter).toHaveBeenCalledWith(
      '1',
      'glossary',
      ['译文'],
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'done');
    expect(tracker.state.progress).toEqual({ finished: 1, error: 0, total: 1 });
  });
});

describe('TaskExecutor preparation boundaries', () => {
  it.each(['chapter', 'metadata'] as const)(
    'rejects a missing %s unit before fetching',
    async (kind) => {
      const task = createMetadataTask();
      const tracker = createTracker(task);
      const work = await new TaskExecutor(task).prepareUnit(
        { ...task.chapters[0], kind, chapterId: 'missing' },
        tracker,
      );
      expect(work).toBeUndefined();
      expect(task.fetchChapter).not.toHaveBeenCalled();
      expect(task.prepareMetadata).not.toHaveBeenCalled();
      expect(tracker.onChapterStatus).toHaveBeenLastCalledWith(
        'missing',
        'error',
      );
    },
  );
});

describe('TaskState ownership', () => {
  it('shows falsy segment errors and hides stale errors once retried', () => {
    const state = new ChapterSegmentState('1');
    state.injectDoneTranslation(['原文'], ['译文']);
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
    const state = new TaskState('test');
    expect(state.initialized).toBe(false);
    state.initialize(task.chapters, task.metadataUnit);
    expect(state.initialized).toBe(true);
    expect(state.units).toEqual([task.metadataUnit, ...task.chapters]);
    state.getChapterState(task.metadataUnit.chapterId);
    state.updateStatus(task.metadataUnit.chapterId, 'error');
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 1 });
    state.updateStatus('1', 'error');
    expect(state.progress).toEqual({ finished: 0, error: 1, total: 1 });
    state.initialize([]);
    expect(state.units).toEqual([]);
    expect(state.chapterStates.size).toBe(0);
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 0 });
  });

  it('requires initialized tasks and only reports status through the tracker', async () => {
    const task = createTask('local');
    task.initialized = false;
    const tracker = { onChapterStatus: vi.fn(), onLog: vi.fn() };
    const work = await new TaskExecutor(task).prepareUnit(
      task.chapters[0],
      tracker,
    );
    expect(work).toBeUndefined();
    expect(task.initialize).not.toHaveBeenCalled();
    expect(task.fetchChapter).not.toHaveBeenCalled();
    expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'error');
    expect(task.chapters[0].status).toBe('pending');

    task.initialized = true;
    const prepared = await new TaskExecutor(task).prepareUnit(
      task.chapters[0],
      tracker,
    );
    expect(tracker.onChapterStatus).toHaveBeenLastCalledWith(
      '1',
      'translating',
    );
    expect(task.chapters[0].status).toBe('pending');
    await prepared!.onComplete({ lines: ['译文'], failed: [] });
    expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'done');
    expect(task.chapters[0].status).toBe('pending');
    expect(task.initialize).not.toHaveBeenCalled();
  });
});
