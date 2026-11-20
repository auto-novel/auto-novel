// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';

import ActionButton from '../src/components/ActionButton.vue';
import ConfirmActionButton from '../src/components/ConfirmActionButton.vue';
import { useRequireLogin } from '../src/util/useRequireLogin';

const mocks = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
const session = reactive({ whoami: { isSignedIn: false } });
vi.mock('@/stores/useWhoamiStore', () => ({ useWhoamiStore: () => session }));
vi.mock('@novelia/web-kit', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Toast: mocks,
    XConfirmDialog: defineComponent({
      props: ['open', 'loading', 'danger'],
      emits: ['confirm', 'update:open'],
      setup:
        (props, { emit }) =>
        () =>
          props.open
            ? h('section', { 'data-danger': props.danger }, [
                h(
                  'button',
                  { class: 'confirm', onClick: () => emit('confirm') },
                  '确定',
                ),
                h(
                  'button',
                  { class: 'close', onClick: () => emit('update:open', false) },
                  '关闭',
                ),
              ])
            : null,
    }),
  };
});
vi.mock('@nuxt/ui/components/Button.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['loading', 'disabled', 'label', 'color', 'variant', 'icon'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              disabled: props.disabled || props.loading,
              'data-loading': !!props.loading,
              'data-color': props.color,
            },
            [
              props.loading
                ? h('span', { 'data-loading-icon': '' })
                : props.icon
                  ? h(props.icon)
                  : null,
              slots.default?.({}) ?? props.label,
            ],
          ),
    }),
  };
});

enableAutoUnmount(afterEach);
afterEach(() => {
  session.whoami.isSignedIn = false;
});

describe('ActionButton', () => {
  it('locks synchronously, shows loading and releases after completion', async () => {
    let finish!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(ActionButton, {
      props: {
        action,
        label: '保存',
        color: 'primary',
      },
    });
    // Keep the shared group marker without overriding the button's default radius.
    expect(wrapper.get('button').classes()).toContain('group');
    expect(wrapper.get('button').classes()).not.toContain('rounded-full');
    void wrapper.get('button').trigger('click');
    void wrapper.get('button').trigger('click');
    expect(action).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('button').attributes('data-color')).toBe('primary');
    finish();
    await flushPromises();
    expect(wrapper.get<HTMLButtonElement>('button').element.disabled).toBe(
      false,
    );
    void wrapper.get('button').trigger('click');
    expect(action).toHaveBeenCalledTimes(2);
    finish();
    await flushPromises();
  });

  it.each(['throw', 'reject'] as const)(
    'releases after %s without swallowing the error or duplicating toasts',
    async (kind) => {
      const error = new Error('保存失败');
      const action = vi.fn(() => {
        if (kind === 'throw') throw error;
        return Promise.reject(error);
      });
      const onError = vi.fn();
      const wrapper = mount(ActionButton, {
        props: { action },
        global: { config: { errorHandler: onError } },
      });
      void wrapper.get('button').trigger('click');
      await flushPromises();
      expect(onError).toHaveBeenCalledWith(
        error,
        expect.anything(),
        expect.anything(),
      );
      expect(mocks.error).not.toHaveBeenCalled();
      expect(wrapper.get<HTMLButtonElement>('button').element.disabled).toBe(
        false,
      );
    },
  );

  it.each([{ disabled: true }, { loading: true }])(
    'honors external blocking state %j',
    async (state) => {
      const action = vi.fn();
      const wrapper = mount(ActionButton, { props: { action } });
      await wrapper.setProps(state);
      void wrapper.get('button').trigger('click');
      await flushPromises();
      expect(action).not.toHaveBeenCalled();
    },
  );
});

describe('login guard', () => {
  it('checks the current session and preserves action arguments and result', () => {
    const action = vi.fn((value: number) => value + 1);
    const guarded = useRequireLogin()(action);
    expect(guarded(1)).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith('请先登录');
    session.whoami.isSignedIn = true;
    expect(guarded(2)).toBe(3);
  });
});

describe('ConfirmActionButton', () => {
  it('requires confirmation, prevents duplicate submission and closes on success', async () => {
    let finish!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(ConfirmActionButton, {
      props: {
        action,
        label: '删除',
        hint: '确定删除？',
        color: 'error',
      },
    });
    void wrapper.get('button').trigger('click');
    await nextTick();
    expect(action).not.toHaveBeenCalled();
    expect(wrapper.get('section').attributes('data-danger')).toBe('true');
    void wrapper.get('.confirm').trigger('click');
    void wrapper.get('.confirm').trigger('click');
    await wrapper.get('.close').trigger('click');
    await nextTick();
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]).toHaveLength(1);
    expect(wrapper.find('section').exists()).toBe(true);
    finish();
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
  });

  it('keeps the dialog open on false or error and allows retry', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValueOnce(true);
    const wrapper = mount(ConfirmActionButton, {
      props: {
        action,
        hint: '确定？',
      },
    });
    void wrapper.get('button').trigger('click');
    await nextTick();
    void wrapper.get('.confirm').trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(true);
    void wrapper.get('.confirm').trigger('click');
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith('失败');
    expect(wrapper.find('section').exists()).toBe(true);
    void wrapper.get('.confirm').trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
  });
});
