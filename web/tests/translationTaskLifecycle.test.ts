import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalTranslationTask } from '../src/domain/translator/TranslationTask/LocalTranslationTask';
import { WebTranslationTask } from '../src/domain/translator/TranslationTask/WebTranslationTask';

const mocks = vi.hoisted(() => ({
  createApi: vi.fn(),
  getTranslateTask: vi.fn(),
  updateMetadata: vi.fn(),
  getNovel: vi.fn(),
  updateWebNovel: vi.fn(),
  store: {
    updateTranslation: vi.fn(),
  },
}));

vi.mock('@/api', () => ({
  WebNovelApi: {
    getNovel: mocks.getNovel,
    createTranslationApi: (...args: unknown[]) => {
      mocks.createApi(...args);
      return {
        getTranslateTask: mocks.getTranslateTask,
        updateMetadataTranslation: mocks.updateMetadata,
      };
    },
  },
  formatError: vi.fn(),
}));
vi.mock('@/domain/crawler', () => ({
  CrawlerService: { updateWebNovel: mocks.updateWebNovel },
}));
vi.mock('@/stores', () => ({ useLocalVolumeStore: async () => mocks.store }));

const params = {
  level: 'normal' as const,
  forceMetadata: false,
  useBrowserCrawler: false,
  startIndex: 0,
  endIndex: 10,
};

const snapshot = {
  glossary: {},
  glossaryUuid: '',
  titleJp: '原文标题',
  titleZh: '译文标题',
  introductionJp: '简介',
  introductionZh: '简介译文',
  toc: [{ chapterId: '1', titleJp: '閑話', titleZh: '已有译文' }],
};

function context(signal = new AbortController().signal) {
  return { signal, onLog: vi.fn() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => vi.resetAllMocks());

describe('web task initialization', () => {
  it('finishes crawling before fetching a single task snapshot', async () => {
    const crawl = deferred<void>();
    const novel = { titleJp: '源站标题' };
    mocks.getNovel.mockResolvedValue(novel);
    mocks.updateWebNovel.mockReturnValue(crawl.promise);
    mocks.getTranslateTask.mockResolvedValue({
      ...snapshot,
      titleZh: undefined,
      titleJp: '新标题',
    });
    const task = new WebTranslationTask('provider', 'novel', 'sakura', {
      ...params,
      useBrowserCrawler: true,
    });
    const execution = context();
    const running = task.initialize(execution);
    await vi.waitFor(() => expect(mocks.updateWebNovel).toHaveBeenCalledOnce());
    expect(task.initialized).toBe(false);
    expect(mocks.getTranslateTask).not.toHaveBeenCalled();
    expect(mocks.updateWebNovel).toHaveBeenCalledWith(
      'provider',
      'novel',
      novel,
      { safeUpdateToc: true, signal: execution.signal },
    );
    crawl.resolve();
    await running;
    await task.initialize(execution);
    expect(mocks.getNovel).toHaveBeenCalledOnce();
    expect(mocks.updateWebNovel).toHaveBeenCalledOnce();
    expect(mocks.getTranslateTask).toHaveBeenCalledOnce();
    expect(task.initialized).toBe(true);
    expect(task.metadataUnit).toMatchObject({
      kind: 'metadata',
      status: 'pending',
    });
    const prepared = await task.prepareMetadata(execution);
    expect(prepared.lines).toEqual(['新标题']);
  });

  it('still loads the snapshot after an ordinary crawler failure', async () => {
    mocks.updateWebNovel.mockRejectedValue(new Error('crawler unavailable'));
    mocks.getTranslateTask.mockResolvedValue(snapshot);
    const task = new WebTranslationTask('provider', 'novel', 'sakura', {
      ...params,
      useBrowserCrawler: true,
    });
    const execution = context();
    await task.initialize(execution);
    expect(mocks.getTranslateTask).toHaveBeenCalledOnce();
    expect(task.initialized).toBe(true);
    expect(execution.onLog).toHaveBeenCalledWith(
      expect.stringContaining('目录更新跳过'),
    );
  });

  it('does not request a snapshot after crawling is cancelled', async () => {
    const crawl = deferred<void>();
    mocks.updateWebNovel.mockReturnValue(crawl.promise);
    const task = new WebTranslationTask('provider', 'novel', 'sakura', {
      ...params,
      useBrowserCrawler: true,
    });
    const controller = new AbortController();
    const running = task.initialize(context(controller.signal));
    const rejected = expect(running).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(mocks.updateWebNovel).toHaveBeenCalledOnce());
    controller.abort();
    crawl.resolve();
    await rejected;
    expect(mocks.getTranslateTask).not.toHaveBeenCalled();
    expect(task.initialized).toBe(false);
  });
});

describe('web metadata units', () => {
  it('creates metadata only when needed, excludes GPT, and preserves force-directory semantics', async () => {
    mocks.getTranslateTask.mockResolvedValue(snapshot);
    const normal = new WebTranslationTask(
      'provider',
      'novel',
      'sakura',
      params,
    );
    await normal.initialize(context());
    expect(normal.metadataUnit).toBeUndefined();
    expect(normal.chapters).toHaveLength(1);
    expect(mocks.getTranslateTask).toHaveBeenCalledOnce();
    expect(mocks.getNovel).not.toHaveBeenCalled();
    expect(mocks.updateWebNovel).not.toHaveBeenCalled();

    const forced = new WebTranslationTask('provider', 'novel', 'sakura', {
      ...params,
      forceMetadata: true,
    });
    await forced.initialize(context());
    expect(forced.metadataUnit).toMatchObject({
      kind: 'metadata',
      status: 'pending',
    });
    const prepared = await forced.prepareMetadata(context());
    expect(prepared.lines).toEqual([]);
    await prepared.save([]);
    expect(mocks.updateMetadata).toHaveBeenCalledWith({
      toc: { 閑話: '闲话' },
    });

    const gpt = new WebTranslationTask('provider', 'novel', 'gpt', {
      ...params,
      forceMetadata: true,
    });
    await gpt.initialize(context());
    expect(gpt.metadataUnit).toBeUndefined();
  });

  it('retains field boundaries/newlines, validates results, and uploads with the execution signal', async () => {
    mocks.getTranslateTask.mockResolvedValue({
      ...snapshot,
      titleZh: undefined,
      introductionZh: undefined,
      introductionJp: '一行\r\n\r\n二行',
    });
    const task = new WebTranslationTask('provider', 'novel', 'sakura', params);
    const initialization = context();
    await task.initialize(initialization);
    const controller = new AbortController();
    const execution = context(controller.signal);
    const prepared = await task.prepareMetadata(execution);
    expect(prepared.lines).toEqual(['原文标题', '一行', '二行']);
    await expect(prepared.save(['不足'])).rejects.toThrow('数量不匹配');
    expect(mocks.updateMetadata).not.toHaveBeenCalled();
    await prepared.save(['标题', '甲', '乙']);
    expect(mocks.updateMetadata).toHaveBeenCalledWith({
      title: '标题',
      introduction: '甲\r\n\r\n乙',
      toc: {},
    });
    expect(mocks.createApi).toHaveBeenLastCalledWith(
      'provider',
      'novel',
      'sakura',
      false,
      execution.signal,
    );
    expect(execution.signal).not.toBe(initialization.signal);
    controller.abort();
    await expect(prepared.save(['迟到标题', '甲', '乙'])).rejects.toMatchObject(
      {
        name: 'AbortError',
      },
    );
    expect(mocks.updateMetadata).toHaveBeenCalledOnce();
  });
});

describe('translation task signal boundaries', () => {
  it('does not apply a late snapshot after cancellation', async () => {
    const oldSnapshot = deferred<unknown>();
    mocks.getTranslateTask.mockReturnValueOnce(oldSnapshot.promise);
    const oldTask = new WebTranslationTask(
      'provider',
      'novel',
      'sakura',
      params,
    );
    const controller = new AbortController();
    const running = oldTask.initialize(context(controller.signal));
    const rejected = expect(running).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();

    oldSnapshot.resolve(snapshot);
    await rejected;
    expect(oldTask.initialized).toBe(false);
    expect(oldTask.chapters).toEqual([]);
    expect(oldTask.metadataUnit).toBeUndefined();
    expect(oldTask.glossaryId).toBe('');
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
