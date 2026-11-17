// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref, type App } from 'vue';

import ReaderContent from '../src/pages/reader/components/ReaderContent.vue';

const readerSetting = ref({
  theme: { mode: 'system', fontColor: '#123456' },
  fontSize: 18,
  fontWeight: 400,
  lineSpace: 1,
  mixJpOpacity: 0.6,
  mixZhOpacity: 1,
  textUnderline: 'none',
  enableSourceLabel: false,
  foldImages: false,
  translations: [],
});
vi.mock('@/stores', () => ({
  useReaderSettingStore: () => ({ readerSetting }),
}));
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));
vi.mock('../src/pages/reader/components/BuildParagraphs', () => ({
  buildParagraphs: () => [
    { text: '本文', indent: '', secondary: false, needSpeak: true },
  ],
}));
vi.mock('@/util/web', () => ({ WebUtil: {} }));
const passthrough = vi.hoisted(() => ({
  inheritAttrs: false,
  setup:
    (_props: unknown, { slots }: { slots: { default?: () => unknown } }) =>
    () =>
      slots.default?.(),
}));
vi.mock('@nuxt/ui/components/Link.vue', () => ({ default: passthrough }));
vi.mock('@nuxt/ui/components/Separator.vue', () => ({ default: passthrough }));
vi.mock('@nuxt/ui/components/Alert.vue', () => ({ default: passthrough }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(mode: string, initiallyDark = false) {
  readerSetting.value.theme = { mode, fontColor: '#123456' };
  let dark = initiallyDark;
  const media = new EventTarget();
  Object.defineProperties(media, {
    matches: { get: () => dark },
    media: { value: '(prefers-color-scheme: dark)' },
  });
  const matchMedia = vi.fn(() => media as MediaQueryList);
  vi.stubGlobal('matchMedia', matchMedia);

  const host = document.createElement('div');
  document.body.append(host);
  app = createApp(ReaderContent, {
    gnid: { type: 'local', volumeId: 'test' },
    chapterId: 'chapter-1',
    chapter: {
      chapterId: 'chapter-1',
      titleJp: '第一章',
      paragraphs: ['本文'],
    },
  });
  const vm = app.mount(host);
  await nextTick();
  expect(host.querySelector('.chapter-content')?.textContent).toContain('本文');
  expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');

  // jsdom 不解析 CSS v-bind 的计算样式，读取实际组件生成样式所用的响应式值。
  const state = vm.$.setupState as {
    fontColor: string;
    underlineColor: string;
  };
  return {
    expectColor(color: string) {
      expect(state.fontColor).toBe(color);
      expect(state.underlineColor).toBe(`${color}80`);
    },
    async setDark(value: boolean) {
      dark = value;
      const event = new Event('change');
      Object.defineProperties(event, {
        matches: { value: dark },
        media: { value: '(prefers-color-scheme: dark)' },
      });
      media.dispatchEvent(event);
      await nextTick();
    },
  };
}

describe('reader content theme', () => {
  it.each([false, true])(
    'follows system changes with initial prefers-dark=%s',
    async (initiallyDark) => {
      const reader = await mount('system', initiallyDark);
      reader.expectColor(initiallyDark ? '#FFFFFF' : '#000000');
      await reader.setDark(!initiallyDark);
      reader.expectColor(initiallyDark ? '#000000' : '#FFFFFF');
      await reader.setDark(initiallyDark);
      reader.expectColor(initiallyDark ? '#FFFFFF' : '#000000');
    },
  );

  it.each([
    ['light', '#000000'],
    ['dark', '#FFFFFF'],
    ['custom', '#123456'],
  ])('keeps %s colors when the system changes', async (mode, color) => {
    const reader = await mount(mode);
    reader.expectColor(color);
    await reader.setDark(true);
    reader.expectColor(color);
    await reader.setDark(false);
    reader.expectColor(color);
  });
});
