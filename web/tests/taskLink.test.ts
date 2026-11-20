// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createMemoryHistory, createRouter } from 'vue-router';

import TaskLink from '../src/pages/workspace/task/TaskLink.vue';

enableAutoUnmount(afterEach);

// 保留真实编解码，隔离统一入口中与链接渲染无关的鉴权客户端。
vi.mock(
  '@/domain/translator',
  () => import('../src/domain/translator/tasks/task-descriptor'),
);

async function mountTaskLink(task: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/');
  return mount(TaskLink, { props: { task }, global: { plugins: [router] } });
}

describe('TaskLink', () => {
  it.each([
    ['web/provider/novel', '/novel/provider/novel', 'web/provider/novel'],
    ['wenku/novel/volume', '/wenku/novel', 'wenku/novel'],
  ])('renders %s as a new-tab link', async (task, href, text) => {
    const wrapper = await mountTaskLink(task);
    const link = wrapper.get('a');

    expect(link.attributes()).toMatchObject({
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(link.text()).toBe(text);
  });

  it('renders malformed persisted tasks without breaking the queue', async () => {
    const wrapper = await mountTaskLink('web/provider');
    expect(wrapper.text()).toContain('无效任务：web/provider');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('renders a local task without a navigation link', async () => {
    const wrapper = await mountTaskLink('local/volume');

    expect(wrapper.text()).toContain('local');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('preserves the chapter range and translation options', async () => {
    const wrapper = await mountTaskLink(
      'web/provider/novel?startIndex=2&endIndex=10&level=all&forceMetadata=true',
    );

    expect(wrapper.text()).toContain(
      'web/provider/novel [2,10) [全部章节/重翻目录]',
    );
  });
});
