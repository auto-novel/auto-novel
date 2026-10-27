import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

import TaskProgress from '../src/pages/workspace/task/TaskProgress.vue';

const progress = { total: 8, done: 2, translating: 2, error: 1, pending: 3 };

describe('TaskProgress', () => {
  it.each([
    ['pending', '等待中'],
    ['executing', '处理中'],
    ['done', '已完成'],
  ] as const)('renders %s as plain text', async (status, label) => {
    const html = await renderToString(
      createSSRApp(TaskProgress, { status, progress }),
    );

    expect(html).toContain(label);
    expect(html).not.toContain('n-tag');
  });

  it('renders counts, accessible progress, and matching ring/bar segments', async () => {
    const html = await renderToString(
      createSSRApp(TaskProgress, { status: 'executing', progress }),
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
    expect(
      Array.from(
        html.matchAll(/stroke-dasharray="([^"]+)"/g),
        (match) => match[1],
      ),
    ).toEqual(['25 75', '25 75', '12.5 87.5']);
    expect(
      Array.from(
        html.matchAll(/stroke-dashoffset="([^"]+)"/g),
        (match) => match[1],
      ),
    ).toEqual(['0', '-25', '-50']);
    expect(
      Array.from(html.matchAll(/style="width:([^;]+);"/g), (match) => match[1]),
    ).toEqual(['25%', '25%', '12.5%']);
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
