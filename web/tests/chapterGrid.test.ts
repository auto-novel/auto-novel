// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { nextTick, reactive } from 'vue';

import { TaskState } from '../src/domain/translator/task-state';
import ChapterGrid from '../src/pages/workspace/task/ChapterGrid.vue';

enableAutoUnmount(afterEach);

function createState(count = 1) {
  const state = reactive(new TaskState());
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

describe('chapter display regions', () => {
  it('shows translating units only when ready and preserves phase labels', async () => {
    const state = createState();
    state.updateStatus('0', 'translating');
    const wrapper = mount(ChapterGrid, { props: { taskState: state } });
    expect(wrapper.find('[data-region]').exists()).toBe(false);

    const detail = prepare(state, '0');
    await nextTick();
    expect(wrapper.find('[data-region="translating"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-chapter-id="0"]').attributes('aria-label'),
    ).toContain('排队中');
    expect(state.chapters[0]!.status).toBe('translating');

    detail.onSegStart(0, 'worker');
    await nextTick();
    expect(
      wrapper.get('[data-chapter-id="0"]').attributes('aria-label'),
    ).toContain('翻译中');
    detail.onSegComplete(0, ['译文']);
    detail.onSegComplete(1, ['后续译文']);
    await nextTick();
    expect(
      wrapper.get('[data-chapter-id="0"]').attributes('aria-label'),
    ).toContain('保存中');

    state.updateStatus('0', 'done');
    await nextTick();
    expect(wrapper.find('[data-region]').exists()).toBe(false);
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

    const wrapper = mount(ChapterGrid, { props: { taskState: state } });
    expect(detail.segments[0]!.translatedLines).toEqual(['译文']);
    expect(wrapper.find('[data-region="paused"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-chapter-id="0"]').attributes('aria-label'),
    ).toContain('已暂停 · 已完成 1/2 段');

    state.updateStatus(unit.chapterId, 'translating');
    await nextTick();
    expect(wrapper.find('[data-region="paused"]').exists()).toBe(false);
    expect(wrapper.find('[data-region="translating"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-chapter-id="0"]').attributes('aria-label'),
    ).toContain('已完成 1/2 段');
  });

  it('does not label untouched, queued or unready units as paused', () => {
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
    const wrapper = mount(ChapterGrid, { props: { taskState: state } });
    expect(wrapper.find('[data-region="paused"]').exists()).toBe(false);
  });

  it('includes interrupted metadata and failed segments without changing task progress', async () => {
    const state = createState();
    const metadata = state.metadataUnit!;
    const detail = prepare(state, metadata.chapterId);
    detail.onSegError(0, new Error('失败原因'));

    const wrapper = mount(ChapterGrid, { props: { taskState: state } });
    expect(
      wrapper.get('[data-region="paused"] button').attributes('aria-label'),
    ).toContain('小说信息 · 小说信息 · 已暂停');
    expect(state.progress).toEqual({ finished: 0, error: 0, total: 1 });
    state.updateStatus(metadata.chapterId, 'error');
    await nextTick();
    expect(wrapper.find('[data-region="paused"]').exists()).toBe(false);
    expect(wrapper.find('[data-region="error"]').exists()).toBe(true);
    state.resetFailedUnits();
    await nextTick();
    expect(wrapper.find('[data-region]').exists()).toBe(false);
  });

  it('limits paused previews to six items and offers expansion', async () => {
    const state = createState(7);
    for (const unit of state.chapters) {
      prepare(state, unit.chapterId).onSegComplete(0, ['译文']);
    }
    const wrapper = mount(ChapterGrid, { props: { taskState: state } });
    const toggle = wrapper.get('[aria-expanded]');
    expect(wrapper.findAll('[data-chapter-id]')).toHaveLength(6);
    expect(toggle.text()).toBe('查看全部 7 项');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    expect(wrapper.findAll('[data-chapter-id]')).toHaveLength(7);
    expect(toggle.attributes('aria-expanded')).toBe('true');
  });
});
