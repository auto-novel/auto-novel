// @vitest-environment jsdom
import UModal from '@nuxt/ui/components/Modal.vue';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  DOMWrapper,
  enableAutoUnmount,
  flushPromises,
  mount as mountComponent,
} from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';

import ReaderLayoutMobile from '../src/pages/reader/components/ReaderLayoutMobile.vue';

const settings = vi.hoisted(() => ({ clickArea: 'menu' }));
vi.mock('@/stores', async () => {
  const { ref } = await import('vue');
  return {
    useReaderSettingStore: () => ({
      readerSetting: ref({ ...settings, enableClickAnimition: false }),
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

enableAutoUnmount((unmount) => {
  afterEach(() => {
    unmount();
    document.body.replaceChildren();
  });
});
afterEach(() => {
  window.getSelection()?.removeAllRanges();
});
const flush = async () => {
  await nextTick();
  await flushPromises();
  // Reka defers focus and body pointer-event cleanup to the next timer turn.
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

async function mount(clickArea = 'menu') {
  settings.clickArea = clickArea;
  const loaded = ref(false);
  const modalOpen = ref(false);
  const wrapper = mountComponent(
    {
      render: () =>
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
                      'onUpdate:open': (open: boolean) =>
                        (modalOpen.value = open),
                    },
                    { body: () => h('button', '弹窗操作') },
                  ),
              },
            )
          : null,
    },
    {
      attachTo: document.body,
      global: {
        components: {
          RouterLink: defineComponent({
            setup:
              (_, { slots }) =>
              () =>
                h('a', slots.default?.()),
          }),
        },
      },
    },
  );
  // 模拟章节异步加载后才挂载移动端布局。
  await flush();
  loaded.value = true;
  await flush();
  return { wrapper, modalOpen };
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

const clickAt = (target: Element, fraction: number) => {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: window.innerWidth * fraction,
    clientY: window.innerHeight * fraction,
  });
  target.dispatchEvent(event);
  return event;
};

describe('reader mobile click gestures', () => {
  it.each(['up-down', 'none'])(
    'ignores interactive content in %s mode',
    async (mode) => {
      await mount(mode);
      const scrollBy = vi
        .spyOn(window, 'scrollBy')
        .mockImplementation(() => {});
      const reader = document.querySelector<HTMLElement>('[data-reader]')!;
      reader.insertAdjacentHTML(
        'beforeend',
        '<a><span data-interactive>链接</span></a>' +
          '<button><span data-interactive>按钮</span></button>' +
          '<details><summary><span data-interactive>插图</span></summary></details>' +
          '<input data-interactive><select data-interactive></select>' +
          '<textarea data-interactive></textarea>' +
          '<label><span data-interactive>标签</span></label>' +
          '<div contenteditable><span data-interactive>编辑</span></div>' +
          '<div contenteditable="plaintext-only"><span data-interactive>纯文本编辑</span></div>' +
          '<div role="button"><span data-interactive>自定义按钮</span></div>',
      );
      for (const target of reader.querySelectorAll('[data-interactive]')) {
        expect(clickAt(target, 0.1).defaultPrevented).toBe(false);
        expect(clickAt(target, 0.5).defaultPrevented).toBe(false);
      }
      await flush();
      expect(scrollBy).not.toHaveBeenCalled();
      expect(menuElement()).toBeNull();
    },
  );

  it('ignores clicks while text is selected', async () => {
    await mount('up-down');
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const reader = document.querySelector<HTMLElement>('[data-reader]')!;
    const range = document.createRange();
    range.selectNodeContents(reader);
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).toBe('正文');
    clickAt(reader, 0.1);
    clickAt(reader, 0.5);
    await flush();
    expect(scrollBy).not.toHaveBeenCalled();
    expect(menuElement()).toBeNull();
  });

  it.each(['up-down', 'left-right'])(
    'keeps ordinary text gestures in %s mode',
    async (mode) => {
      await mount(mode);
      const scrollBy = vi
        .spyOn(window, 'scrollBy')
        .mockImplementation(() => {});
      const reader = document.querySelector<HTMLElement>('[data-reader]')!;
      // 折叠插图的正文仍可使用阅读手势，只有 summary 是交互控件。
      reader.insertAdjacentHTML(
        'beforeend',
        '<details open><p>插图正文</p></details>',
      );
      const text = reader.querySelector('p')!;
      const selection = window.getSelection()!;
      selection.collapse(text, 0);
      clickAt(text, 0.1);
      clickAt(text, 0.9);
      expect(scrollBy).toHaveBeenNthCalledWith(1, {
        top: -0.8 * window.innerHeight,
        behavior: 'instant',
      });
      expect(scrollBy).toHaveBeenNthCalledWith(2, {
        top: 0.8 * window.innerHeight,
        behavior: 'instant',
      });
      expect(menuElement()).toBeNull();
      clickAt(text, 0.5);
      await flush();
      expect(menuElement()).not.toBeNull();
    },
  );
});

describe('reader mobile menu', () => {
  it.each(['目录', '设置'])(
    'keeps %s above the menu, including after reopening',
    async (label) => {
      const { wrapper, modalOpen } = await mount();
      await wrapper.get('[data-reader]').trigger('click');
      await flush();
      const menu = menuElement()!;
      expect(menu).not.toBeNull();
      const trigger = [...menu.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      )!;
      for (let i = 0; i < 2; i++) {
        await new DOMWrapper(trigger).trigger('click');
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
