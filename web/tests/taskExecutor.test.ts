import { describe, expect, it, vi } from 'vitest';

import { TaskExecutor } from '../src/domain/translator/TaskExecutor';
import type { TranslationTask } from '../src/domain/translator/TranslationTask/types';

function createTask(type: TranslationTask['type']) {
  return {
    type,
    description: 'test',
    level: 'normal' as const,
    initialized: true,
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
    initMeta: vi.fn(),
    fetchChapter: vi.fn().mockResolvedValue({
      paragraphs: ['原文'],
      glossary: {},
      glossaryId: 'glossary',
    }),
    uploadChapter: vi.fn(),
  } satisfies TranslationTask;
}

function createTracker() {
  return {
    onChapterStatus: vi.fn(),
    onProgress: vi.fn(),
    onLog: vi.fn(),
  };
}

describe('TaskExecutor trust requirements', () => {
  it.each(['local', 'web', 'wenku'] as const)(
    'sets the input requirement for %s without gating successful saves on worker state',
    async (type) => {
      const task = createTask(type);
      const tracker = createTracker();
      const canCommit = vi.fn(() => true);
      const work = await new TaskExecutor(task, canCommit).prepareChapter(
        '1',
        tracker,
      );

      expect(work?.trustedOnly).toBe(type !== 'local');
      await work!.onComplete({ lines: ['译文'], failed: [] });
      expect(task.uploadChapter).toHaveBeenCalledWith(
        '1',
        'glossary',
        ['译文'],
        expect.objectContaining({ canCommit }),
      );
      expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'done');
    },
  );

  it('does not save when the task lifecycle becomes invalid', async () => {
    const task = createTask('web');
    let current = true;
    const work = await new TaskExecutor(task, () => current).prepareChapter(
      '1',
      createTracker(),
    );
    current = false;

    await expect(
      work!.onComplete({ lines: ['译文'], failed: [] }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(task.uploadChapter).not.toHaveBeenCalled();
  });
});
