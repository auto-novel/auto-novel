import type * as PiniaColada from '@pinia/colada';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ref } from 'vue';

import { FavoredRepo } from '../src/stores/useFavored';

const { favoriteWebNovel, favoriteWenkuNovel, invalidateQueries, listFavored } =
  vi.hoisted(() => ({
    favoriteWebNovel: vi.fn(),
    favoriteWenkuNovel: vi.fn(),
    invalidateQueries: vi.fn(),
    listFavored: vi.fn(),
  }));
vi.mock('@/api', () => ({
  FavoredApi: { favoriteWebNovel, favoriteWenkuNovel, listFavored },
}));
vi.mock('@pinia/colada', async (importOriginal) => ({
  ...(await importOriginal<typeof PiniaColada>()),
  useQueryCache: () => ({ invalidateQueries }),
}));
vi.mock('@/util', () => ({
  useLocalStorage: (_key: string, defaults: object) => ref(defaults),
}));
const whoami = ref({ isSignedIn: false });
vi.mock('../src/stores/useWhoamiStore', () => ({
  useWhoamiStore: () => ({ whoami }),
}));

beforeEach(() => {
  favoriteWebNovel.mockReset().mockResolvedValue(undefined);
  favoriteWenkuNovel.mockReset().mockResolvedValue(undefined);
  invalidateQueries.mockReset().mockResolvedValue(undefined);
});

describe('FavoredRepo.moveNovels', () => {
  it.each([false, true])(
    'continues after partial failure and preserves counts (refresh failure: %s)',
    async (refreshFailed) => {
      favoriteWenkuNovel.mockRejectedValueOnce(new Error('move failed'));
      invalidateQueries.mockImplementation(({ key }) =>
        refreshFailed && key[0] === 'wenku-novel-list-favored'
          ? Promise.reject(new Error('refresh failed'))
          : Promise.resolve(),
      );

      await expect(
        FavoredRepo.moveNovels(
          'target',
          ['first', 'second', 'third'].map((novelId) => ({
            type: 'wenku',
            novelId,
          })),
        ),
      ).resolves.toEqual({ success: 2, failed: 1, refreshFailed });
      expect(favoriteWenkuNovel).toHaveBeenCalledTimes(3);
      // Successful moves refresh the folder lists once, not once per novel.
      expect(
        invalidateQueries.mock.calls.filter(
          ([{ key }]) => key[0] === 'wenku-novel-list-favored',
        ),
      ).toHaveLength(1);
    },
  );

  it('does not refresh unchanged lists when every move fails', async () => {
    favoriteWebNovel.mockRejectedValue(new Error('failed'));

    await expect(
      FavoredRepo.moveNovels('target', [
        { type: 'web', providerId: 'provider', novelId: 'first' },
      ]),
    ).resolves.toEqual({ success: 0, failed: 1, refreshFailed: false });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
