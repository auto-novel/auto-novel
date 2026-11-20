// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type * as WebKit from '@novelia/web-kit';

import { TaskState } from '../src/domain/translator/task-state';
import TaskCard from '../src/pages/workspace/task/TaskCard.vue';

enableAutoUnmount(afterEach);

vi.mock('@novelia/web-kit', async (importOriginal) => ({
  ...(await importOriginal<typeof WebKit>()),
  Toast: { info: vi.fn() },
}));
vi.mock('@/pages/workspace/task/ChapterGrid.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@/pages/workspace/task/ChapterPreviewDialog.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@/pages/workspace/task/TaskLink.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@/pages/workspace/WorkspaceActionButton.vue', () => ({
  default: { render: () => null },
}));

describe('TaskCard', () => {
  it.each([0, 1])(
    'shows metadata-only failure with %i completed chapters',
    (chapterCount) => {
      const taskState = new TaskState();
      taskState.initialize(
        Array.from({ length: chapterCount }, (_, order) => ({
          kind: 'chapter' as const,
          chapterId: String(order),
          title: `Chapter ${order}`,
          order,
          completed: true,
        })),
        { kind: 'metadata', title: '小说信息' },
      );
      taskState.updateStatus(taskState.metadataUnit!.chapterId, 'error');

      const wrapper = mount(TaskCard, {
        props: {
          job: { task: 'local/volume', description: '小说', createAt: 1 },
          taskState,
          canMoveTop: false,
          canMoveBottom: false,
        },
        global: {
          stubs: {
            UCard: { template: '<div><slot name="header" /><slot /></div>' },
          },
        },
      });

      expect(
        wrapper.get('[role="progressbar"]').attributes('aria-valuetext'),
      ).toContain(`任务失败，共 ${chapterCount} 章`);
      expect(wrapper.text()).not.toContain('等待中');
    },
  );
});
