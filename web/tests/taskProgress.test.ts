import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

import TaskProgress from '../src/pages/workspace/task/TaskProgress.vue';

describe('TaskProgress', () => {
  it('renders chapter counts and accessible progress', async () => {
    const html = await renderToString(
      createSSRApp(TaskProgress, {
        status: 'executing',
        progress: { total: 8, done: 2, translating: 2, error: 1, pending: 3 },
      }),
    );

    expect(html).toContain('等待3');
    expect(html).toContain('完成2');
    expect(html).toContain('错误1');
    expect(html).toContain('总计8');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="8"');
    expect(html).toContain(
      '共 8 章，成功 2 章，处理中 2 章，失败 1 章，等待 3 章',
    );
    expect(html).toContain('25%');
  });

  it('handles an empty task without invalid percentages', async () => {
    const html = await renderToString(
      createSSRApp(TaskProgress, {
        status: 'pending',
        progress: { total: 0, done: 0, translating: 0, error: 0, pending: 0 },
      }),
    );

    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('aria-valuemax="1"');
    expect(html).toContain('0%');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
