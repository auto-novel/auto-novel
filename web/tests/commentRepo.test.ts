import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { Comment, CommentPage } from '@novelia/web-kit';

const mocks = vi.hoisted(() => ({
  api: {
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentStatus: vi.fn(),
    getComments: vi.fn(),
  },
}));
const whoami = ref({ user: { id: 1 } });
vi.mock('@/webKit', () => ({ webKit: { whoami } }));
vi.mock('@/api', () => ({ CommentApi: mocks.api }));
vi.mock('@pinia/colada', () => ({ useQuery: (options: unknown) => options }));

type Key = (string | number)[];
type Entry = { key: Key; state: { value: { data?: CommentPage } } };
const entries: Entry[] = [];
const pending: { key: Key; controller: AbortController }[] = [];
const matches = (key: Key, prefix: Key) =>
  prefix.every((part, i) => part === key[i]);
const cache = {
  getEntries: vi.fn(({ key }: { key: Key }) =>
    entries.filter((e) => matches(e.key, key)),
  ),
  setQueryData: vi.fn((key: Key, data: CommentPage) => {
    const entry = entries.find(
      (e) => JSON.stringify(e.key) === JSON.stringify(key),
    );
    if (entry) entry.state.value.data = data;
    else entries.push({ key, state: { value: { data } } });
  }),
  cancelQueries: vi.fn(({ key }: { key: Key }) => {
    pending
      .filter((p) => matches(p.key, key))
      .forEach((p) => p.controller.abort());
  }),
  invalidateQueries: vi.fn(async () => {}),
  remove: vi.fn((entry: Entry) => entries.splice(entries.indexOf(entry), 1)),
};
vi.mock('../src/repos/cache', () => ({ getQueryCache: () => cache }));
const { CommentRepo: repo } = await import('../src/repos/useComment');
const comment = (id: number, authorId = 7): Comment => ({
  id,
  authorId,
  subjectKey: 'site',
  rootId: null,
  content: 'old',
  authorUsername: 'author',
  authorBlocked: false,
  status: 0,
  createdAt: 'before',
  updatedAt: 'before',
  replyCount: 3,
});
const seed = (
  site = 'site',
  items = [comment(1)],
  viewer = 1,
  kind = 'roots',
) => {
  const key = ['comment-list', viewer, site, kind, 1];
  cache.setQueryData(key, { total: 10, items });
  return entries[entries.length - 1]!;
};
const data = (entry: Entry) => entry.state.value.data!;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  whoami.value = { user: { id: 1 } };
  entries.length = 0;
  pending.length = 0;
  vi.clearAllMocks();
  Object.values(mocks.api).forEach((fn) => fn.mockReset());
});

describe('CommentRepo mutations', () => {
  it('updates only the requested site and cancels old pages before writing', async () => {
    const root = seed();
    const replies = seed('site', [comment(1)], 1, 'replies');
    const otherSite = seed('other');
    const otherViewer = seed('site', [comment(1)], 2);
    const controller = new AbortController();
    pending.push({ key: root.key, controller });
    const stalePage = deferred<CommentPage>();
    const oldRequest = stalePage.promise.then((page) => {
      if (!controller.signal.aborted) cache.setQueryData(root.key, page);
    });
    const updated = { ...comment(1), content: 'edited', updatedAt: 'now' };
    mocks.api.updateComment.mockResolvedValue(updated);
    await expect(repo.updateComment(1, 'site', 'edited')).resolves.toEqual(
      updated,
    );
    expect(mocks.api.updateComment).toHaveBeenCalledWith(1, {
      content: 'edited',
    });
    stalePage.resolve({ total: 10, items: [comment(1)] });
    await oldRequest;
    for (const entry of [root, replies]) {
      expect(data(entry).items[0]).toMatchObject({
        content: 'edited',
        updatedAt: 'now',
        replyCount: 3,
      });
    }
    expect(data(otherSite).items[0]!.content).toBe('old');
    expect(data(otherViewer).items[0]!.content).toBe('old');
    const setOrders = cache.setQueryData.mock.invocationCallOrder;
    expect(cache.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      setOrders[setOrders.length - 1]!,
    );
    expect(cache.invalidateQueries).toHaveBeenCalledWith({
      key: ['comment-list', 1, 'site'],
    });
  });

  it.each([false, true])(
    'routes deletion correctly (asAdmin=%s), preserving counts',
    async (asAdmin) => {
      const entry = seed();
      await (asAdmin
        ? repo.deleteComment(1, 'site', true)
        : repo.deleteComment(1, 'site'));
      if (asAdmin) {
        expect(mocks.api.setCommentStatus).toHaveBeenCalledWith(1, 'deleted');
        expect(mocks.api.deleteComment).not.toHaveBeenCalled();
      } else {
        expect(mocks.api.deleteComment).toHaveBeenCalledWith(1);
        expect(mocks.api.setCommentStatus).not.toHaveBeenCalled();
      }
      expect(data(entry)).toMatchObject({
        total: 10,
        items: [{ id: 1, status: 2, replyCount: 3 }],
      });
      expect(cache.invalidateQueries).toHaveBeenCalledWith({
        key: ['comment-list', 1, 'site'],
      });
    },
  );

  it.each(['hideComment', 'unhideComment'] as const)(
    'cancels stale pages and invalidates after %s',
    async (method) => {
      const entry = seed();
      await repo[method](1);
      expect(mocks.api.setCommentStatus).toHaveBeenCalledWith(
        1,
        method === 'hideComment' ? 'hidden' : 'published',
      );
      expect(data(entry).items[0]!.status).toBe(
        method === 'hideComment' ? 1 : 0,
      );
      expect(cache.cancelQueries).toHaveBeenCalledWith({
        key: ['comment-list', 1],
      });
      expect(cache.invalidateQueries).toHaveBeenCalledWith({
        key: ['comment-list', 1],
      });
    },
  );

  it.each(['update', 'delete', 'admin', 'hide', 'unhide'])(
    'ignores late %s after switching accounts, even away and back',
    async (operation) => {
      const response = deferred<Comment>();
      Object.values(mocks.api).forEach((fn) =>
        fn.mockReturnValue(response.promise),
      );
      seed();
      const request =
        operation === 'update'
          ? repo.updateComment(1, 'site', 'edited')
          : operation === 'hide'
            ? repo.hideComment(1)
            : operation === 'unhide'
              ? repo.unhideComment(1)
              : repo.deleteComment(1, 'site', operation === 'admin');
      whoami.value = { user: { id: 2 } };
      const secondAccount = seed('site', [comment(1)], 2);
      whoami.value = { user: { id: 1 } };
      const fresh = seed();
      vi.clearAllMocks();
      response.resolve({ ...comment(1), content: 'edited' });
      await request;
      expect(data(fresh).items[0]).toEqual(comment(1));
      expect(data(secondAccount).items[0]).toEqual(comment(1));
      expect(cache.setQueryData).not.toHaveBeenCalled();
      expect(cache.cancelQueries).not.toHaveBeenCalled();
      expect(cache.invalidateQueries).not.toHaveBeenCalled();
    },
  );

  it('does not touch cached data on failure', async () => {
    const entry = seed();
    mocks.api.updateComment.mockRejectedValue(new Error('offline'));
    await expect(repo.updateComment(1, 'site', 'edited')).rejects.toThrow(
      'offline',
    );
    expect(data(entry).items[0]!.content).toBe('old');
    expect(cache.cancelQueries).not.toHaveBeenCalled();
    expect(cache.invalidateQueries).not.toHaveBeenCalled();
  });
});
