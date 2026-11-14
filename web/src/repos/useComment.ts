import { computed, watch } from 'vue';
import { useQuery } from '@pinia/colada';
import type {
  Comment,
  CommentPage,
  CreateCommentRequest,
} from '@novelia/web-kit';

import { CommentApi } from '@/api';
import { webKit } from '@/webKit';
import { getQueryCache } from './cache';

const ListKey = 'comment-list';
const ReplyPageSize = 20;
const viewerKey = computed(() => webKit.whoami.value.user?.id ?? 'guest');
const commentsKey = () => [ListKey, viewerKey.value];
let viewerRevision = 0;

// Blacklist filtering is viewer-specific; never reuse another account's pages.
watch(
  viewerKey,
  (_, previous) => {
    viewerRevision++;
    const filter = { key: [ListKey, previous] };
    const cache = getQueryCache();
    cache.cancelQueries(filter);
    for (const entry of cache.getEntries(filter)) cache.remove(entry);
  },
  { flush: 'sync' },
);

const commentListKey = (site: string, page: number) => [
  ...commentsKey(),
  site,
  'roots',
  page,
];
const replyListKey = (site: string, rootId: number, page: number) => [
  ...commentsKey(),
  site,
  'replies',
  rootId,
  page,
];

const useCommentList = (
  page: MaybeRefOrGetter<number>,
  site: MaybeRefOrGetter<string>,
) =>
  useQuery({
    key: () => commentListKey(toValue(site), toValue(page)),
    query: async ({ signal }) => {
      const requestedSite = toValue(site);
      const revision = viewerRevision;
      const result = await CommentApi.getComments(
        requestedSite,
        {
          page: toValue(page),
          pageSize: 10,
        },
        signal,
      );
      const items = result.items.map(({ replies, ...comment }) => {
        if (replies && !signal.aborted && revision === viewerRevision) {
          getQueryCache().setQueryData<CommentPage>(
            replyListKey(requestedSite, comment.id, 1),
            replies,
          );
        }
        return comment;
      });
      return { ...result, items };
    },
  });

const useReplyList = (
  page: MaybeRefOrGetter<number>,
  site: MaybeRefOrGetter<string>,
  rootId: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
) =>
  useQuery({
    key: () => replyListKey(toValue(site), toValue(rootId), toValue(page)),
    enabled: () => toValue(enabled),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    query: ({ signal }) =>
      CommentApi.getReplies(
        toValue(site),
        toValue(rootId),
        {
          page: toValue(page),
          pageSize: ReplyPageSize,
        },
        signal,
      ),
  });

// Capture the account before awaiting, including switch-away-and-back sessions.
const mutateComments = async <T>(
  action: () => Promise<T>,
  update?: (comment: Comment, result: T) => Comment,
  site?: string,
): Promise<T> => {
  const revision = viewerRevision;
  const filter = {
    key: site === undefined ? commentsKey() : [...commentsKey(), site],
  };
  const result = await action();
  if (revision !== viewerRevision) return result;
  // Stop in-flight pages from restoring pre-mutation content/status.
  const cache = getQueryCache();
  cache.cancelQueries(filter);
  if (update) {
    const updatePage = (page: CommentPage): CommentPage => ({
      ...page,
      items: page.items.map((comment) => {
        const updated = update(comment, result);
        return updated.replies
          ? { ...updated, replies: updatePage(updated.replies) }
          : updated;
      }),
    });
    for (const entry of cache.getEntries(filter)) {
      const page = entry.state.value.data as CommentPage | undefined;
      if (page) cache.setQueryData<CommentPage>(entry.key, updatePage(page));
    }
  }
  await cache.invalidateQueries(filter);
  return result;
};

export const CommentRepo = {
  useCommentList,
  useReplyList,
  replyPageSize: ReplyPageSize,

  async setUserBlocked(userId: number, blocked: boolean) {
    const revision = viewerRevision;
    await CommentApi.setUserBlocked(userId, blocked);
    if (revision !== viewerRevision) return;
    const filter = { key: commentsKey() };
    const cache = getQueryCache();
    // Cancel stale responses before removing blocked authors from cached pages.
    cache.cancelQueries(filter);
    if (blocked) {
      for (const entry of cache.getEntries(filter)) {
        const page = entry.state.value.data as CommentPage | undefined;
        if (!page) continue;
        const items = page.items.filter(
          (comment) => comment.authorId !== userId,
        );
        cache.setQueryData<CommentPage>(entry.key, {
          ...page,
          total: Math.max(0, page.total - (page.items.length - items.length)),
          items,
        });
      }
    }
    // Server filtering also updates totals, reply counts and pagination.
    await cache.invalidateQueries(filter);
  },

  createComment: (site: string, request: CreateCommentRequest) =>
    mutateComments(
      () => CommentApi.createComment(site, request),
      undefined,
      site,
    ),
  updateComment: (id: number, site: string, content: string) =>
    mutateComments(
      () => CommentApi.updateComment(id, { content }),
      (comment, updated) =>
        comment.id === id
          ? {
              ...comment,
              content: updated.content,
              updatedAt: updated.updatedAt,
            }
          : comment,
      site,
    ),
  deleteComment: (id: number, site: string, asAdmin = false) =>
    mutateComments(
      () =>
        asAdmin
          ? CommentApi.setCommentStatus(id, 'deleted')
          : CommentApi.deleteComment(id),
      (comment) => (comment.id === id ? { ...comment, status: 2 } : comment),
      site,
    ),
  hideComment: (id: number) =>
    mutateComments(
      () => CommentApi.setCommentStatus(id, 'hidden'),
      (comment) => (comment.id === id ? { ...comment, status: 1 } : comment),
    ),
  unhideComment: (id: number) =>
    mutateComments(
      () => CommentApi.setCommentStatus(id, 'published'),
      (comment) => (comment.id === id ? { ...comment, status: 0 } : comment),
    ),
};
