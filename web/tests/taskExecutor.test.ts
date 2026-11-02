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
    'sets the trust requirement for %s inputs',
    async (type) => {
      const task = createTask(type);
      const tracker = createTracker();
      const controller = new AbortController();
      const work = await new TaskExecutor(task).prepareChapter(
        '1',
        tracker,
        controller.signal,
      );

      expect(work?.trustedOnly).toBe(type !== 'local');
      await work!.onComplete({ lines: ['译文'], failed: [] });
      expect(task.uploadChapter).toHaveBeenCalledWith(
        '1',
        'glossary',
        ['译文'],
        expect.objectContaining({ signal: controller.signal }),
      );
      expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'done');
    },
  );

  it('marks a successful save done even when stopped immediately after saving', async () => {
    const task = createTask('local');
    const tracker = createTracker();
    const controller = new AbortController();
    task.uploadChapter.mockImplementation(async () => {
      controller.abort();
    });
    const work = await new TaskExecutor(task).prepareChapter(
      '1',
      tracker,
      controller.signal,
    );
    await expect(
      work!.onComplete({ lines: ['译文'], failed: [] }),
    ).resolves.toBeUndefined();
    expect(tracker.onChapterStatus).toHaveBeenLastCalledWith('1', 'done');
  });
});
