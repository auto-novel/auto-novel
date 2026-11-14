import { describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { TaskState } from '../src/domain/translator/task-state';
import TaskCard from '../src/pages/workspace/task/TaskCard.vue';

vi.mock('@novelia/web-kit', () => ({ Toast: { info: vi.fn() } }));
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
    async (chapterCount) => {
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

      const html = await renderToString(
        createSSRApp(TaskCard, {
          job: { task: 'local/volume', description: '小说', createAt: 1 },
          taskState,
          canMoveTop: false,
          canMoveBottom: false,
        }),
      );

      expect(html).toContain('text-error');
      expect(html).toContain(`任务失败，共 ${chapterCount} 章`);
      expect(html).not.toContain('等待中');
    },
  );
});
