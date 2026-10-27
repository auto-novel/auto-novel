import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';

import TaskLink from '../src/pages/workspace/task/TaskLink.vue';

async function renderTaskLink(task: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const app = createSSRApp(TaskLink, { task }).use(router);
  await router.push('/');
  return renderToString(app);
}

describe('TaskLink', () => {
  it.each([
    ['web/provider/novel', '/novel/provider/novel', 'web/provider/novel'],
    ['wenku/novel/volume', '/wenku/novel', 'wenku/novel'],
  ])('renders %s as a new-tab link', async (task, href, text) => {
    const html = await renderTaskLink(task);

    expect(html).toContain(`href="${href}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(text);
    expect(html).not.toContain('n-text');
  });

  it('renders a local task as plain muted text', async () => {
    const html = await renderTaskLink('local/volume');

    expect(html).toContain('<span');
    expect(html).toContain('text-muted');
    expect(html).toContain('local');
    expect(html).not.toContain('href=');
  });

  it('preserves the chapter range and translation options', async () => {
    const html = await renderTaskLink(
      'web/provider/novel?startIndex=2&endIndex=10&level=all&forceMetadata=true',
    );

    expect(html).toContain('web/provider/novel [2,10) [全部章节/重翻目录]');
  });
});
