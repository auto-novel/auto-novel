import { useQuery, useQueryCache } from '@pinia/colada';
import { v4 as uuidv4 } from 'uuid';

import type { Favored } from '@/api';
import { FavoredApi } from '@/api';
import { useLocalStorage } from '@/util';
import { LSKey } from './key';
import { useWhoamiStore } from './useWhoamiStore';

interface FavoredList {
  web: Favored[];
  wenku: Favored[];
  local: Favored[];
}

export const useFavoredStore = defineStore(LSKey.Favored, () => {
  const favoreds = useLocalStorage<FavoredList>(LSKey.Favored, {
    web: [{ id: 'default', title: '默认收藏夹' }],
    wenku: [{ id: 'default', title: '默认收藏夹' }],
    local: [{ id: 'default', title: '默认收藏夹' }],
  });

  const whoamiStore = useWhoamiStore();
  const { whoami } = storeToRefs(whoamiStore);

  const { data: remoteFavoredList } = useQuery({
    enabled: whoami.value.isSignedIn,
    key: ['favored-list'],
    query: () => FavoredApi.listFavored(),
  });

  watch(remoteFavoredList, (remoteFavoredList) => {
    if (remoteFavoredList) {
      favoreds.value.web = remoteFavoredList.favoredWeb;
      favoreds.value.wenku = remoteFavoredList.favoredWenku;
    }
  });

  return { favoreds };
});

const createFavored = async (
  type: 'web' | 'wenku' | 'local',
  title: string,
) => {
  const store = useFavoredStore();
  const favoreds = store.favoreds[type];
  if (favoreds.length >= 20) {
    throw new Error('收藏夹最多只能创建20个');
  }
  let id: string;
  if (type === 'web') {
    id = await FavoredApi.createFavoredWeb({ title });
  } else if (type === 'wenku') {
    id = await FavoredApi.createFavoredWenku({ title });
  } else {
    id = uuidv4();
  }
  favoreds.push({ id, title });
};

const updateFavored = async (
  type: 'web' | 'wenku' | 'local',
  id: string,
  title: string,
) => {
  if (type === 'web') {
    await FavoredApi.updateFavoredWeb(id, { title });
  } else if (type === 'wenku') {
    await FavoredApi.updateFavoredWenku(id, { title });
  }
  const store = useFavoredStore();
  const favoreds = store.favoreds[type];
  const favored = favoreds.find((it) => it.id === id);
  if (favored !== undefined) {
    favored.title = title;
  }
};

const deleteFavored = async (type: 'web' | 'wenku' | 'local', id: string) => {
  if (id === 'default') {
    throw new Error('无法删除默认收藏夹');
  }
  if (type === 'web') {
    await FavoredApi.deleteFavoredWeb(id);
  } else if (type === 'wenku') {
    await FavoredApi.deleteFavoredWenku(id);
  }
  const store = useFavoredStore();
  store.favoreds[type] = store.favoreds[type].filter((it) => it.id !== id);
};

const favoriteNovel = async (
  favoredId: string,
  novel:
    | { type: 'web'; providerId: string; novelId: string }
    | { type: 'wenku'; novelId: string },
) => {
  const queryCache = useQueryCache();
  if (novel.type === 'web') {
    await FavoredApi.favoriteWebNovel(
      favoredId,
      novel.providerId,
      novel.novelId,
    );
    await queryCache.invalidateQueries({
      key: ['web-novel', novel.providerId, novel.novelId],
      exact: true,
    });
  } else if (novel.type === 'wenku') {
    await FavoredApi.favoriteWenkuNovel(favoredId, novel.novelId);
    await queryCache.invalidateQueries({
      key: ['wenku-novel', novel.novelId],
      exact: true,
    });
  } else {
    novel satisfies never;
  }
};

const unfavoriteNovel = async (
  favoredId: string,
  novel:
    | { type: 'web'; providerId: string; novelId: string }
    | { type: 'wenku'; novelId: string },
) => {
  const queryCache = useQueryCache();
  if (novel.type === 'web') {
    await FavoredApi.unfavoriteWebNovel(
      favoredId,
      novel.providerId,
      novel.novelId,
    );
    await queryCache.invalidateQueries({
      key: ['web-novel', novel.providerId, novel.novelId],
      exact: true,
    });
  } else if (novel.type === 'wenku') {
    await FavoredApi.unfavoriteWenkuNovel(favoredId, novel.novelId);
    await queryCache.invalidateQueries({
      key: ['wenku-novel', novel.novelId],
      exact: true,
    });
  } else {
    novel satisfies never;
  }
};

export const FavoredRepo = {
  useFavoredStore,
  createFavored,
  updateFavored,
  deleteFavored,
  favoriteNovel,
  unfavoriteNovel,
};
