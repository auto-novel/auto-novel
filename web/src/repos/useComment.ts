import { useQuery } from '@pinia/colada';
import type { CommentPage, CreateCommentRequest } from '@novelia/forum-api';

import { CommentApi } from '@/api';
import { cache } from './cache';

const ListKey = 'comment-list';

const useCommentList = (
  page: MaybeRefOrGetter<number>,
  site: MaybeRefOrGetter<string>,
) =>
  useQuery({
    key: () => [ListKey, toValue(site), toValue(page)],
    query: () =>
      CommentApi.getComments(toValue(site), {
        page: toValue(page),
        pageSize: 10,
      }),
  });

const invalidateComments = (site: string) =>
  cache.invalidateQueries({ key: [ListKey, site] });

const updateCommentStatus = (id: number, status: number) => {
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
