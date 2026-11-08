import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { TaskState } from '../src/domain/translator/task-state';
import ChapterGrid from '../src/pages/workspace/task/ChapterGrid.vue';

function createState(count = 1) {
  const state = new TaskState();
  state.initialize(
    Array.from({ length: count }, (_, i) => ({
      kind: 'chapter' as const,
      chapterId: String(i),
      title: `Chapter ${i}`,
      order: i + 1,
      completed: false,
    })),
    { kind: 'metadata', title: '小说信息' },
  );
  return state;
}

function prepare(state: TaskState, id: string) {
  const detail = state.getUnitDetails(id)!;
  detail.onSegmentsReady([
    { id: '0', order: 0, lines: ['原文'] },
    { id: '1', order: 1, lines: ['后续原文'] },
  ]);
  return detail;
}

const render = (taskState: TaskState) =>
  renderToString(createSSRApp(ChapterGrid, { taskState }));

describe('chapter display regions', () => {
  it('shows translating units only when ready and preserves phase labels', async () => {
    const state = createState();
    state.updateStatus('0', 'translating');
    expect(await render(state)).not.toContain('data-region=');

    const detail = prepare(state, '0');
    const queuedHtml = await render(state);
    expect(queuedHtml).toContain('data-region="translating"');
    expect(queuedHtml).toContain('排队中');
    expect(state.chapters[0]!.status).toBe('translating');

    detail.onSegStart(0, 'worker');
    expect(await render(state)).toContain('翻译中');
    detail.onSegComplete(0, ['译文']);
    detail.onSegComplete(1, ['后续译文']);
    expect(await render(state)).toContain('保存中');

    state.updateStatus('0', 'done');
    expect(await render(state)).not.toContain('data-region=');
  });

  it('keeps completed translations visible after abort and leaves the paused group on resume', async () => {
    const state = createState();
    const unit = state.chapters[0]!;
    const detail = prepare(state, unit.chapterId);
    state.updateStatus(unit.chapterId, 'translating');
    detail.onSegComplete(0, ['译文']);
    detail.onSegStart(1, 'worker');
    detail.onAbort();
    state.updateStatus(unit.chapterId, 'pending');

    expect(state.isPausedUnit(unit)).toBe(true);
    expect(detail.segments[0]!.translatedLines).toEqual(['译文']);
    const html = await render(state);
    expect(html).toContain('data-region="paused"');
    expect(html).toContain('已暂停');
    expect(html).toContain('已完成 1/2 段');

    state.updateStatus(unit.chapterId, 'translating');
    expect(state.isPausedUnit(unit)).toBe(false);
    const resumedHtml = await render(state);
    expect(resumedHtml).not.toContain('data-region="paused"');
    expect(resumedHtml).toContain('data-region="translating"');
    expect(resumedHtml).toContain('已完成 1/2 段');
  });

  it('does not label untouched, queued or unready units as paused', async () => {
    const state = createState(3);
    prepare(state, '1');
    const unready = state.getUnitDetails('2')!;
    unready.segments = [
      {
        status: 'done',
        lines: [],
        translatedLines: [],
        error: null,
      },
    ];
    for (const unit of state.units)
      expect(state.isPausedUnit(unit)).toBe(false);
    expect(await render(state)).not.toContain('data-region="paused"');
  });

  it('includes interrupted metadata and failed segments without changing task progress', async () => {
    const state = createState();
    const metadata = state.metadataUnit!;
    const detail = prepare(state, metadata.chapterId);
    detail.onSegError(0, new Error('失败原因'));

    expect(state.isPausedUnit(metadata)).toBe(true);
    expect(await render(state)).toContain('小说信息 · 小说信息 · 已暂停');
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 1 });
    state.updateStatus(metadata.chapterId, 'error');
    expect(state.isPausedUnit(metadata)).toBe(false);
    expect(await render(state)).toContain('data-region="error"');
    state.resetFailedUnits();
    expect(state.isPausedUnit(metadata)).toBe(false);
  });

  it('limits paused previews to six items and offers expansion', async () => {
    const state = createState(7);
    for (const unit of state.chapters) {
      prepare(state, unit.chapterId).onSegComplete(0, ['译文']);
    }
    const html = await render(state);
    expect(html.match(/data-chapter-id=/g)).toHaveLength(6);
    expect(html).toContain('查看全部 7 项');
    expect(html).toContain('aria-expanded="false"');
  });
});
