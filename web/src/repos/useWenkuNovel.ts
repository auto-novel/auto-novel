import { useQuery } from '@pinia/colada';

import { FavoredApi, WenkuNovelApi } from '@/api';
import { getQueryCache, withOnSuccess } from './cache';

const ItemKey = 'wenku-novel';
const ListKey = 'wenku-novel-list';
const ListFavoredKey = 'wenku-novel-list-favored';

const useWenkuNovel = (novelId: string, enabled: boolean = true) =>
  useQuery({
    enabled,
    key: [ItemKey, novelId],
    query: () => WenkuNovelApi.getNovel(novelId),
  });

const useWenkuNovelList = (
  page: MaybeRefOrGetter<number>,
  option: MaybeRefOrGetter<{
    query?: string;
    level?: number;
  }>,
) =>
  useQuery({
    key: () => [ListKey, toValue(option), toValue(page)],
    query: () =>
      WenkuNovelApi.listNovel({
        page: toValue(page) - 1,
        pageSize: 24,
        ...toValue(option),
      }),
  });

const useWenkuNovelFavoredList = (
  page: MaybeRefOrGetter<number>,
  favoredId: MaybeRefOrGetter<string>,
  option: MaybeRefOrGetter<{
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
      FavoredApi.listFavoredWenkuNovel(toValue(favoredId), {
        page: toValue(page) - 1,
        pageSize: 24,
        ...toValue(option),
      }),
  });

export const WenkuNovelRepo = {
  useWenkuNovel,
  useWenkuNovelList,
  useWenkuNovelFavoredList,

  createNovel: withOnSuccess(WenkuNovelApi.createNovel, () =>
    getQueryCache().invalidateQueries({ key: [ListKey] }),
  ),
  updateNovel: withOnSuccess(WenkuNovelApi.updateNovel, (_, novelId) =>
    getQueryCache().invalidateQueries({
      key: [ItemKey, novelId],
      exact: true,
    }),
  ),
  createVolume: (
    novelId: string,
    volumeId: string,
    type: 'jp' | 'zh',
    file: File,
    onProgress: (p: number) => void,
  ) => {
    const task = WenkuNovelApi.createVolume(
      novelId,
      volumeId,
      type,
      file,
      onProgress,
    );

    return <typeof task>{
      abort: task.abort,
      promise: task.promise.then(async (ret) => {
        await getQueryCache().invalidateQueries({
          key: [ItemKey, novelId],
          exact: true,
        });
        return ret;
      }),
    };
  },
  deleteVolume: withOnSuccess(WenkuNovelApi.deleteVolume, (_, novelId) =>
    getQueryCache().invalidateQueries({
      key: [ItemKey, novelId],
      exact: true,
    }),
  ),
};
