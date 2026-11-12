// @vitest-environment jsdom
import UModal from '@nuxt/ui/components/Modal.vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';

import ReaderLayoutMobile from '../src/pages/reader/components/ReaderLayoutMobile.vue';

vi.mock('@/stores', async () => {
  const { ref } = await import('vue');
  return {
    useReaderSettingStore: () => ({
      readerSetting: ref({ clickArea: 'menu' }),
    }),
  };
});
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));
vi.mock('@nuxt/ui/components/Button.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('button', slots.default?.()),
    }),
  };
});

let app: App;
afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
const menuElement = () =>
  document.querySelector<HTMLElement>('[role=dialog][data-side=bottom]');
const modalElement = () =>
  document.querySelector<HTMLElement>('[role=dialog]:not([data-side])');
const escape = async () => {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await flush();
};

async function mount() {
  const loaded = ref(false);
  const modalOpen = ref(false);
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp(() =>
    loaded.value
      ? h(
          ReaderLayoutMobile,
          {
            chapter: {} as never,
            modalOpen: modalOpen.value,
            onRequireCatalogModal: () => (modalOpen.value = true),
            onRequireSettingModal: () => (modalOpen.value = true),
          },
          {
            default: () => h('div', { 'data-reader': '' }, '正文'),
            modals: () =>
              h(
                UModal,
                {
                  open: modalOpen.value,
                  title: '阅读弹窗',
                  'onUpdate:open': (open: boolean) => (modalOpen.value = open),
                },
                { body: () => h('button', '弹窗操作') },
              ),
          },
        )
      : null,
  );
  app.component(
    'RouterLink',
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('a', slots.default?.()),
    }),
  );
  app.mount(host);
  // 模拟章节异步加载后才挂载移动端布局。
  await flush();
  loaded.value = true;
  await flush();
  return { modalOpen };
}

function expectModalAboveMenu(menu: HTMLElement) {
  const modal = modalElement()!;
  expect(modal).not.toBeNull();
  expect(menuElement()).toBe(menu);
  // 真实 Nuxt Portal 必须在菜单之后，不能只验证 Reka 的交互栈。
  expect(
    menu.compareDocumentPosition(modal) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const overlay = modal.previousElementSibling!;
  expect(overlay.getAttribute('data-slot')).toBe('overlay');
  expect(
    menu.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(menu.style.pointerEvents).toBe('none');
}

describe('reader mobile menu', () => {
  it.each(['目录', '设置'])(
    'keeps %s above the menu, including after reopening',
    async (label) => {
      const { modalOpen } = await mount();
      document.querySelector<HTMLElement>('[data-reader]')!.click();
      await flush();
      const menu = menuElement()!;
      expect(menu).not.toBeNull();
      const trigger = [...menu.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      )!;
      for (let i = 0; i < 2; i++) {
        trigger.click();
        await flush();
        expect(modalOpen.value).toBe(true);
        expectModalAboveMenu(menu);
        await escape();
        expect(modalOpen.value).toBe(false);
        expect(modalElement()).toBeNull();
        expect(menuElement()).toBe(menu);
        expect(menu.style.pointerEvents).toBe('auto');
      }
      await escape();
      expect(menuElement()).toBeNull();
      expect(document.body.style.pointerEvents).not.toBe('none');
    },
  );

  it('opens the menu host for an externally opened modal', async () => {
    const { modalOpen } = await mount();
    expect(menuElement()).toBeNull();
    modalOpen.value = true;
    await flush();
    const menu = menuElement()!;
    expect(menu).not.toBeNull();
    expectModalAboveMenu(menu);
    await escape();
    expect(modalOpen.value).toBe(false);
    expect(menuElement()).toBe(menu);
  });
});
