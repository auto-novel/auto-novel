// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';

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

const apps: App[] = [];
function mount(
  component: Parameters<typeof h>[0],
  props: Record<string, unknown>,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  const onError = vi.fn();
  app.config.errorHandler = onError;
  app.mount(host);
  apps.push(app);
  return {
    host,
    onError,
    click: (selector = 'button') =>
      host.querySelector<HTMLButtonElement>(selector)!.click(),
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
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
    const { host, click } = mount(ActionButton, {
      action,
      label: '保存',
      color: 'primary',
    });
    // Call sites rely on these shared defaults after removing duplicate classes.
    expect(host.querySelector('button')!.classList.contains('group')).toBe(
      true,
    );
    expect(
      host.querySelector('button')!.classList.contains('rounded-full'),
    ).toBe(true);
    click();
    click();
    expect(action).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(host.querySelector('button')!.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.querySelector('button')!.getAttribute('data-color')).toBe(
      'primary',
    );
    finish();
    await flush();
    expect(host.querySelector('button')!.disabled).toBe(false);
    click();
    expect(action).toHaveBeenCalledTimes(2);
    finish();
    await flush();
  });

  it.each(['throw', 'reject'] as const)(
    'releases after %s without swallowing the error or duplicating toasts',
    async (kind) => {
      const error = new Error('保存失败');
      const action = vi.fn(() => {
        if (kind === 'throw') throw error;
        return Promise.reject(error);
      });
      const { host, click, onError } = mount(ActionButton, { action });
      click();
      await flush();
      expect(onError).toHaveBeenCalledWith(
        error,
        expect.anything(),
        expect.anything(),
      );
      expect(mocks.error).not.toHaveBeenCalled();
      expect(host.querySelector('button')!.disabled).toBe(false);
    },
  );

  it.each([{ disabled: true }, { loading: true }])(
    'honors external blocking state %j',
    async (state) => {
      const action = vi.fn();
      const { click } = mount(ActionButton, { action, ...state });
      click();
      await flush();
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
    const { host, click } = mount(ConfirmActionButton, {
      action,
      label: '删除',
      hint: '确定删除？',
      color: 'error',
    });
    click();
    await nextTick();
    expect(action).not.toHaveBeenCalled();
    expect(host.querySelector('section')!.getAttribute('data-danger')).toBe(
      'true',
    );
    click('.confirm');
    click('.confirm');
    click('.close');
    await nextTick();
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]).toHaveLength(1);
    expect(host.querySelector('section')).not.toBeNull();
    finish();
    await flush();
    expect(host.querySelector('section')).toBeNull();
  });

  it('keeps the dialog open on false or error and allows retry', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValueOnce(true);
    const { host, click } = mount(ConfirmActionButton, {
      action,
      hint: '确定？',
    });
    click();
    await nextTick();
    click('.confirm');
    await flush();
    expect(host.querySelector('section')).not.toBeNull();
    click('.confirm');
    await flush();
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith('失败');
    expect(host.querySelector('section')).not.toBeNull();
    click('.confirm');
    await flush();
    expect(host.querySelector('section')).toBeNull();
  });
});
