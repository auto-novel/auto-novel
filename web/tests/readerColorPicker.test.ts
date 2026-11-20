// @vitest-environment jsdom
import UModal from '@nuxt/ui/components/Modal.vue';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  DOMWrapper,
  enableAutoUnmount,
  flushPromises,
  mount as mountComponent,
} from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import ReaderColorPicker from '../src/pages/reader/components/ReaderColorPicker.vue';

enableAutoUnmount((unmount) => {
  afterEach(() => {
    unmount();
    document.body.replaceChildren();
  });
});
const flush = async () => {
  await nextTick();
  await flushPromises();
  // Reka defers focus and body pointer-event cleanup to the next timer turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

async function mount() {
  const bodyColor = ref('#FFFFFF');
  const fontColor = ref('#000000');
  const modalOpen = ref(true);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  await router.push('/');
  await router.isReady();
  mountComponent(
    {
      render: () =>
        h(
          UModal,
          {
            open: modalOpen.value,
            title: '阅读设置',
            'onUpdate:open': (open: boolean) => (modalOpen.value = open),
          },
          {
            body: () =>
              (
                [
                  ['背景', bodyColor],
                  ['文字', fontColor],
                ] as const
              ).map(([label, color]) =>
                h(ReaderColorPicker, {
                  label,
                  modelValue: color.value,
                  'onUpdate:modelValue': (value: string) =>
                    (color.value = value),
                }),
              ),
          },
        ),
    },
    { attachTo: document.body, global: { plugins: [router] } },
  );
  await flush();
  return { bodyColor, fontColor, modalOpen };
}

async function openPicker(label: string) {
  await new DOMWrapper(
    document.querySelector<HTMLButtonElement>(
      `button[aria-label^="${label}："]`,
    )!,
  ).trigger('click');
  await flush();
  return document.querySelector<HTMLInputElement>(
    `input[aria-label="${label} HEX"]`,
  )!;
}
async function enter(input: HTMLInputElement, value: string) {
  await new DOMWrapper(input).setValue(value);
  await flush();
}
async function escape() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await flush();
}

describe('reader color pickers', () => {
  it('portals outside the modal, allows editing and closes layers in order', async () => {
    const { bodyColor, fontColor, modalOpen } = await mount();
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="背景：#FFFFFF"]',
    )!;
    const modal = trigger.closest('[role="dialog"]')!;
    let input = await openPicker('背景');
    const popover = input.closest('[role="dialog"]')!;
    expect(modal.contains(input)).toBe(false);
    expect(document.body.contains(popover)).toBe(true);
    expect(
      modal.compareDocumentPosition(popover) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    input.focus();
    await flush();
    expect(document.activeElement).toBe(input);
    await enter(input, '#abcdef');
    expect(bodyColor.value).toBe('#ABCDEF');
    expect(fontColor.value).toBe('#000000');
    await escape();
    expect(modalOpen.value).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('input[aria-label="背景 HEX"]')).toBeNull();
    expect(
      document.querySelector('button[aria-label="背景：#ABCDEF"]'),
    ).not.toBeNull();
    input = await openPicker('文字');
    await enter(input, '#123456');
    expect(fontColor.value).toBe('#123456');
    expect(bodyColor.value).toBe('#ABCDEF');
    await escape();
    expect(modalOpen.value).toBe(true);
    await escape();
    expect(modalOpen.value).toBe(false);
  });

  it('rejects invalid or alpha colors and follows externally selected presets', async () => {
    const { bodyColor } = await mount();
    const input = await openPicker('背景');
    for (const invalid of ['', '#xyzxyz', '#11223380']) {
      await enter(input, invalid);
      expect(bodyColor.value).toBe('#FFFFFF');
      expect(input.getAttribute('aria-invalid')).toBe('true');
    }
    bodyColor.value = '#E3EDCD';
    await flush();
    expect(input.value).toBe('#E3EDCD');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(
      document.querySelector('button[aria-label="背景：#E3EDCD"]'),
    ).not.toBeNull();
  });
});
