// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';

import Reader from '../src/pages/reader/Reader.vue';
import type { ReaderChapter } from '../src/pages/reader/ReaderStore';
import { Ok, type Result } from '../src/util/result';

const mocks = vi.hoisted(() => ({
  loadChapter: vi.fn(),
  onScroll: undefined as
    | undefined
    | ((payload: { chapterId: string; percent: number; y: number }) => void),
}));
const route = reactive({
  path: '/novel/test/book/a',
  params: { chapterId: 'a', providerId: 'test', novelId: 'book' },
});
const readerSetting = ref({ pageTurnMode: 'scroll', pageWidth: 800 });
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));
vi.mock('@/stores', () => ({
  useWhoamiStore: () => ({ whoami: ref({ isSignedIn: false }) }),
  useReaderSettingStore: () => ({ readerSetting }),
  useLocalVolumeStore: vi.fn(),
}));
vi.mock('@/api', () => ({ ReadHistoryApi: {} }));
vi.mock('@/repos', () => ({
  ReadPositionRepo: { getPosition: vi.fn(), addPosition: vi.fn() },
}));
vi.mock('@/util', () => ({ checkIsMobile: () => false }));
vi.mock('../src/pages/reader/ReaderStore', () => ({
  useReaderStore: () => ({
    loadChapter: mocks.loadChapter,
    preloadChapter: vi.fn(),
  }),
}));
vi.mock('../src/pages/reader/components/useScrollDetector', () => ({
  useScrollDetector: (callback: typeof mocks.onScroll) => {
    mocks.onScroll = callback;
  },
}));
vi.mock('@novelia/web-kit', () => ({
  LoadingBar: { start: () => ({ finish: vi.fn(), error: vi.fn() }) },
}));
const empty = vi.hoisted(() => ({ render: () => null }));
vi.mock('../src/pages/reader/components/ReaderLayoutDesktop.vue', () => ({
  default: empty,
}));
vi.mock('../src/pages/reader/components/ReaderLayoutMobile.vue', () => ({
  default: empty,
}));
vi.mock('../src/pages/reader/components/ReaderContent.vue', () => ({
  default: empty,
}));
vi.mock('../src/pages/reader/components/ReaderSettingModal.vue', () => ({
  default: empty,
}));
vi.mock('../src/pages/reader/components/CatalogModal.vue', () => ({
  default: empty,
}));

enableAutoUnmount(afterEach);
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const flush = async () => {
  await nextTick();
  await nextTick();
};
const chapter = (chapterId: string, nextId?: string): Result<ReaderChapter> =>
  Ok({ chapterId, nextId, titleJp: chapterId, paragraphs: ['text'] });

async function mountReader() {
  readerSetting.value.pageTurnMode = 'scroll';
  vi.stubGlobal('scrollTo', vi.fn());
  mocks.loadChapter.mockImplementation((id: string) => ({
    type: 'sync',
    promiseOrValue: chapter(id, id === 'a' ? 'b' : undefined),
  }));
  const wrapper = mount(Reader, { attachTo: document.body });
  const vm = wrapper.vm;
  await flush();
  return (
    vm.$ as typeof vm.$ & {
      setupState: {
        navToChapter: (id: string) => Promise<void>;
        chapterList: { chapterId: string; result?: Result<ReaderChapter> }[];
      };
    }
  ).setupState;
}

function preload() {
  let resolve!: (result: Result<ReaderChapter>) => void;
  const promise = new Promise<Result<ReaderChapter>>((done) => {
    resolve = done;
  });
  mocks.loadChapter.mockReturnValueOnce({
    type: 'async',
    promiseOrValue: promise,
  });
  mocks.onScroll!({ chapterId: 'a', percent: 0.9, y: 100 });
  return resolve;
}

describe('reader scroll loading', () => {
  it('appends the result while the current reading session is unchanged', async () => {
    const state = await mountReader();
    const resolve = preload();
    resolve(chapter('b'));
    await flush();
    expect(state.chapterList[1]?.result).toEqual(chapter('b'));
  });

  it('ignores a pending append after navigating away', async () => {
    const state = await mountReader();
    const resolve = preload();
    await state.navToChapter('c');
    resolve(chapter('b'));
    await flush();
    expect(state.chapterList).toEqual([
      { chapterId: 'c', result: chapter('c') },
    ]);
  });

  it('does not overwrite a chapter with the same id from a new session', async () => {
    const state = await mountReader();
    const resolve = preload();
    await state.navToChapter('b');
    resolve(Ok({ chapterId: 'b', titleJp: 'stale', paragraphs: [] }));
    await flush();
    expect(state.chapterList).toEqual([
      { chapterId: 'b', result: chapter('b') },
    ]);
  });

  it('ignores a pending append when switching to page mode', async () => {
    const state = await mountReader();
    const resolve = preload();
    readerSetting.value.pageTurnMode = 'page';
    await flush();
    resolve(chapter('b'));
    await flush();
    expect(state.chapterList).toEqual([
      { chapterId: 'a', result: chapter('a', 'b') },
    ]);
  });
});
