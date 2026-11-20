// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import TaskProgress from '../src/pages/workspace/task/TaskProgress.vue';

enableAutoUnmount(afterEach);

describe('TaskProgress', () => {
  it('renders chapter counts and accessible progress', () => {
    const wrapper = mount(TaskProgress, {
      props: {
        status: 'executing',
        progress: { total: 8, done: 2, translating: 2, error: 1, pending: 3 },
      },
    });

    for (const label of ['等待3', '完成2', '错误1', '总计8', '25%']) {
      expect(wrapper.text()).toContain(label);
    }
    expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(1);
    expect(wrapper.get('[role="progressbar"]').attributes()).toMatchObject({
      'aria-valuenow': '2',
      'aria-valuemax': '8',
      'aria-valuetext': '共 8 章，成功 2 章，处理中 2 章，失败 1 章，等待 3 章',
    });
  });

  it('renders an empty finished task as a full circle', () => {
    const wrapper = mount(TaskProgress, {
      props: {
        status: 'done',
        progress: { total: 0, done: 0, translating: 0, error: 0, pending: 0 },
      },
    });

    expect(
      wrapper.get('[role="progressbar"]').attributes('aria-valuenow'),
    ).toBe('1');
    expect(wrapper.text()).toContain('100%');
  });

  it('handles an empty task without invalid percentages', () => {
    const wrapper = mount(TaskProgress, {
      props: {
        status: 'pending',
        progress: { total: 0, done: 0, translating: 0, error: 0, pending: 0 },
      },
    });

    expect(wrapper.get('[role="progressbar"]').attributes()).toMatchObject({
      'aria-valuenow': '0',
      'aria-valuemax': '1',
    });
    expect(wrapper.text()).toContain('0%');
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/);
  });
});
