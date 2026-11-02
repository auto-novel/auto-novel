import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalTranslationTask } from '../src/domain/translator/TranslationTask/LocalTranslationTask';
import { WebTranslationTask } from '../src/domain/translator/TranslationTask/WebTranslationTask';

const mocks = vi.hoisted(() => ({
  getTranslateTask: vi.fn(),
  updateMetadata: vi.fn(),
  store: {
    updateTranslation: vi.fn(),
  },
}));

vi.mock('@/api', () => ({
  WebNovelApi: {
    createTranslationApi: () => ({
      getTranslateTask: mocks.getTranslateTask,
      updateMetadataTranslation: mocks.updateMetadata,
    }),
  },
  formatError: vi.fn(),
}));
vi.mock('@/domain/crawler', () => ({ CrawlerService: {} }));
vi.mock('@/stores', () => ({ useLocalVolumeStore: async () => mocks.store }));

const params = {
  level: 'normal' as const,
  forceMetadata: false,
  useBrowserCrawler: false,
  startIndex: 0,
  endIndex: 10,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => vi.resetAllMocks());

describe('translation task signal boundaries', () => {
  it('does not upload a late metadata translation after cancellation', async () => {
    mocks.getTranslateTask.mockResolvedValue({
      glossary: {},
      glossaryUuid: '',
      titleJp: '原文标题',
      introductionJp: '',
      toc: [],
    });
    const task = new WebTranslationTask('provider', 'novel', 'sakura', params);
    await task.initMeta();
    const translated = deferred<string[]>();
    const translate = vi.fn(() => translated.promise);
    const controller = new AbortController();
    const running = task.translateMetadata(translate, controller.signal);
    expect(translate).toHaveBeenCalledWith(['原文标题']);

    controller.abort();
    const rejected = expect(running).rejects.toMatchObject({
      name: 'AbortError',
    });
    translated.resolve(['译文标题']);
    await rejected;
    expect(mocks.updateMetadata).not.toHaveBeenCalled();
  });

  it('checks cancellation at the actual local DAO write boundary', async () => {
    const task = new LocalTranslationTask('volume', 'sakura', params);
    const controller = new AbortController();
    const ready = deferred<void>();
    const releaseWrite = deferred<void>();
    const write = vi.fn();
    mocks.store.updateTranslation.mockImplementation(
      async (
        _volume,
        _chapter,
        _translator,
        _translation,
        beforeWrite: () => void,
      ) => {
        ready.resolve();
        await releaseWrite.promise;
        beforeWrite();
        write();
      },
    );
    const running = task.uploadChapter('chapter', 'glossary', ['译文'], {
      signal: controller.signal,
      onLog: vi.fn(),
    });
    await ready.promise;
    controller.abort();
    const rejected = expect(running).rejects.toMatchObject({
      name: 'AbortError',
    });
    releaseWrite.resolve();
    await rejected;
    expect(write).not.toHaveBeenCalled();
  });
});
