import { useQuery } from '@pinia/colada';
import type {
  CommentPage,
  CommentStatus,
  CreateCommentRequest,
} from '@novelia/forum-api';

import { CommentApi } from '@/api';
import { cache } from './cache';

const ListKey = 'comment-list';
const ReplyPageSize = 20;

const commentListKey = (site: string, page: number) => [
  ListKey,
  site,
  'roots',
  page,
];
const replyListKey = (site: string, rootId: number, page: number) => [
  ListKey,
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
      const result = await CommentApi.getComments(
        requestedSite,
        {
          page: toValue(page),
          pageSize: 10,
        },
        signal,
      );
      const items = result.items.map(({ replies, ...comment }) => {
        if (replies && !signal.aborted) {
          cache.setQueryData<CommentPage>(
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

const invalidateComments = (site: string) =>
  cache.invalidateQueries({ key: [ListKey, site] });

const updateCommentStatus = (id: number, status: CommentStatus) => {
  for (const entry of cache.getEntries({ key: [ListKey] })) {
    const page = entry.state.value.data as CommentPage | undefined;
    if (!page) continue;
    cache.setQueryData<CommentPage>(entry.key, {
      ...page,
      items: page.items.map((comment) =>
        comment.id === id ? { ...comment, status } : comment,
      ),
    });
  }
};

export const CommentRepo = {
  useCommentList,
  useReplyList,
  replyPageSize: ReplyPageSize,

  createComment: (site: string, request: CreateCommentRequest) =>
    CommentApi.createComment(site, request).then((comment) => {
      invalidateComments(site);
      return comment;
    }),
  deleteComment: (id: number, site: string) =>
    CommentApi.deleteComment(id).then(() => invalidateComments(site)),
  hideComment: (id: number) =>
    CommentApi.setCommentStatus(id, 'hidden').then(() =>
      updateCommentStatus(id, 1),
    ),
  unhideComment: (id: number) =>
    CommentApi.setCommentStatus(id, 'published').then(() =>
      updateCommentStatus(id, 0),
    ),
};
