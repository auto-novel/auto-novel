import { PiniaColada, useQueryCache } from '@pinia/colada';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, effectScope, nextTick, ref } from 'vue';
import type { EffectScope } from 'vue';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { CommentApi } from '../src/api/novel/CommentApi';
import type { Comment1 } from '../src/model/Comment';
import type { Page } from '../src/model/Page';
import type * as CommentModule from '../src/repos/useComment';

const api = vi.hoisted(() => ({
  listComment: vi.fn<typeof CommentApi.listComment>(),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  hideComment: vi.fn(),
  unhideComment: vi.fn(),
}));
vi.mock('@/api', () => ({ CommentApi: api }));

const replyPage = (id: string): Page<Comment1> => ({
  pageNumber: 3,
  items: [
    {
      id,
      user: { username: id },
      content: id,
      hidden: false,
      createAt: 0,
      numReplies: 0,
      replies: [],
    },
  ],
});
const deferred = () => {
  let resolve!: (value: Page<Comment1>) => void;
  const promise = new Promise<Page<Comment1>>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};
const flush = async () => {
  await nextTick();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const pinia = createPinia();
const app = createApp({});
app.use(pinia);
app.use(PiniaColada);
let CommentRepo: typeof CommentModule.CommentRepo;
let scope: EffectScope;

beforeAll(async () => {
  setActivePinia(pinia);
  ({ CommentRepo } = await import('../src/repos/useComment'));
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.resetAllMocks();
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  const cache = useQueryCache(pinia);
  cache.cancelQueries();
  cache.getEntries().forEach((entry) => cache.remove(entry));
  vi.useRealTimers();
});

const openReplies = () => {
  const page = ref(1);
  const query = app.runWithContext(
    () =>
      scope.run(() =>
        CommentRepo.useCommentList(
          page,
          'web-test',
          'parent',
          replyPage('first'),
        ),
      )!,
  );
  return { page, query };
};

describe('comment reply pagination', () => {
  it('uses preloaded replies only for page one and fetches the first visit to page two', async () => {
    const { page, query } = openReplies();
    await flush();
    expect(query.data.value).toEqual(replyPage('first'));
    expect(api.listComment).not.toHaveBeenCalled();

    const request = deferred();
    api.listComment.mockReturnValueOnce(request.promise);
    page.value = 2;
    await flush();
    expect(api.listComment).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      pageSize: 10,
      site: 'web-test',
      parentId: 'parent',
    });
    expect(query.data.value).toBeUndefined();
    expect(query.isLoading.value).toBe(true);

    request.resolve(replyPage('second'));
    await flush();
    expect(query.data.value).toEqual(replyPage('second'));
    expect(query.isLoading.value).toBe(false);
  });

  it('reuses the correct cached replies when returning to a loaded page', async () => {
    api.listComment.mockResolvedValue(replyPage('second'));
    const { page, query } = openReplies();
    page.value = 2;
    await flush();
    expect(query.data.value).toEqual(replyPage('second'));

    page.value = 1;
    await flush();
    expect(query.data.value).toEqual(replyPage('first'));
    page.value = 2;
    await flush();
    expect(query.data.value).toEqual(replyPage('second'));
    expect(api.listComment).toHaveBeenCalledTimes(1);
  });

  it('refreshes expired reply pages while keeping their own cached data', async () => {
    api.listComment.mockResolvedValueOnce(replyPage('second'));
    const { page, query } = openReplies();
    page.value = 2;
    await flush();
    expect(query.data.value).toEqual(replyPage('second'));

    vi.setSystemTime(Date.now() + 6_000);
    const request = deferred();
    api.listComment
      .mockResolvedValueOnce(replyPage('first-updated'))
      .mockReturnValueOnce(request.promise);
    page.value = 1;
    await flush();
    expect(query.data.value).toEqual(replyPage('first-updated'));

    page.value = 2;
    await flush();
    expect(api.listComment.mock.calls.map(([params]) => params.page)).toEqual([
      1, 0, 1,
    ]);
    expect(query.data.value).toEqual(replyPage('second'));
    expect(query.isLoading.value).toBe(true);

    request.resolve(replyPage('second-updated'));
    await flush();
    expect(query.data.value).toEqual(replyPage('second-updated'));
    expect(query.isLoading.value).toBe(false);
  });

  it('keeps the selected page when an earlier request finishes later', async () => {
    const second = deferred();
    const third = deferred();
    api.listComment
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const { page, query } = openReplies();
    page.value = 2;
    await flush();
    page.value = 3;
    await flush();

    third.resolve(replyPage('third'));
    await flush();
    second.resolve(replyPage('second'));
    await flush();
    expect(api.listComment.mock.calls.map(([params]) => params.page)).toEqual([
      1, 2,
    ]);
    expect(query.data.value).toEqual(replyPage('third'));
  });

  it('retries a failed reply page when returning to it', async () => {
    const error = new Error('Request failed');
    api.listComment
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(replyPage('second'));
    const { page, query } = openReplies();
    page.value = 2;
    await flush();
    expect(query.error.value).toBe(error);
    expect(query.data.value).toBeUndefined();

    page.value = 1;
    await flush();
    expect(query.data.value).toEqual(replyPage('first'));
    page.value = 2;
    await flush();
    expect(api.listComment).toHaveBeenCalledTimes(2);
    expect(query.error.value).toBeNull();
    expect(query.data.value).toEqual(replyPage('second'));
  });
});
