import { useQuery, useQueryCache } from '@pinia/colada';

import { FavoredApi, ReadHistoryApi, WebNovelApi } from '@/api';
import { withOnSuccess } from './cache';

const ItemKey = 'web-novel';
const ListKey = 'web-novel-list';
const ListRankKey = 'web-novel-list-rank';
const ListHistoryKey = 'web-novel-list-history';
const ListFavoredKey = 'web-novel-list-favored';

const useWebNovel = (
  providerId: string,
  novelId: string,
  enabled: boolean = true,
) =>
  useQuery({
    enabled,
    key: [ItemKey, providerId, novelId],
    query: () => WebNovelApi.getNovel(providerId, novelId),
  });

const useWebNovelList = (
  page: MaybeRefOrGetter<number>,
  option: MaybeRefOrGetter<{
    query?: string;
    provider?: string;
    type?: number;
    level?: number;
    translate?: number;
    sort?: number;
  }>,
) =>
  useQuery({
    key: () => [ListKey, toValue(option), toValue(page)],
    query: () =>
      WebNovelApi.listNovel({
        page: toValue(page) - 1,
        pageSize: 20,
        ...toValue(option),
      }),
  });

const useWebNovelRankList = (
  providerId: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<{ [key: string]: string }>,
) =>
  useQuery({
    key: () => [ListRankKey, toValue(providerId), toValue(params)],
    query: () => WebNovelApi.listRank(toValue(providerId), toValue(params)),
  });

const useWebNovelHistoryList = (page: MaybeRefOrGetter<number>) =>
  useQuery({
    key: () => [ListHistoryKey, toValue(page)],
    query: () =>
      ReadHistoryApi.listReadHistoryWeb({
        page: toValue(page) - 1,
        pageSize: 30,
      }),
  });

const useWebNovelFavoredList = (
  page: MaybeRefOrGetter<number>,
  favoredId: MaybeRefOrGetter<string>,
  option: MaybeRefOrGetter<{
    query?: string;
    provider?: string;
    type?: number;
    level?: number;
    translate?: number;
    sort: string;
  }>,
) =>
  useQuery({
    key: () => [
      ListFavoredKey,
      toValue(favoredId),
      toValue(option),
      toValue(page),
    ],
    query: () =>
      FavoredApi.listFavoredWebNovel(toValue(favoredId), {
        page: toValue(page) - 1,
        pageSize: 30,
        ...toValue(option),
      }),
  });

export const WebNovelRepo = {
  useWebNovel,
  useWebNovelList,
  useWebNovelRankList,
  useWebNovelHistoryList,
  useWebNovelFavoredList,

  updateNovel: withOnSuccess(
    WebNovelApi.updateNovel,
    (_, providerId, novelId) =>
      useQueryCache().invalidateQueries({
        key: [ItemKey, providerId, novelId],
        exact: true,
      }),
  ),
};
