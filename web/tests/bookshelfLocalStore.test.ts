import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBookshelfLocalStore } from '../src/pages/bookshelf/BookshelfLocalStore';

const { listVolume, deleteVolume } = vi.hoisted(() => ({
  listVolume: vi.fn(),
  deleteVolume: vi.fn(),
}));
vi.mock('@/stores', () => ({
  useLocalVolumeStore: async () => ({ listVolume, deleteVolume }),
}));
vi.mock('@/domain/translator', () => ({ TranslateTaskDescriptor: {} }));
vi.mock('@/util', () => ({ downloadFile: vi.fn(), querySearch: vi.fn() }));

beforeEach(() => {
  setActivePinia(createPinia());
  listVolume.mockReset();
  deleteVolume.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('local bookshelf recovery', () => {
  it('retains existing data on failure and clears the error when retrying', async () => {
    const store = useBookshelfLocalStore();
    const volumes = [{ id: 'existing.txt', favoredId: 'default' }];
    listVolume.mockResolvedValueOnce(volumes);
    await store.loadVolumes();
    listVolume.mockRejectedValueOnce(new Error('unavailable'));

    await expect(store.loadVolumes()).rejects.toThrow('unavailable');
    expect(store.loading).toBe(false);
    expect(store.loadError).toBe('unavailable');
    expect(store.volumes).toEqual(volumes);

    listVolume.mockResolvedValueOnce([]);
    await store.loadVolumes();
    expect(store.loadError).toBeNull();
    expect(store.volumes).toEqual([]);
  });

  it('uses repository data to delete only the target folder and rejects partial failure', async () => {
    const store = useBookshelfLocalStore();
    const volumes = [
      { id: 'first.txt', favoredId: 'target' },
      { id: 'second.txt', favoredId: 'target' },
      { id: 'other.txt', favoredId: 'other' },
    ];
    listVolume.mockResolvedValueOnce(volumes);
    await store.loadVolumes();
    // A volume added outside this view must also be deleted, despite the stale cache.
    listVolume.mockResolvedValueOnce([
      ...volumes,
      { id: 'new.txt', favoredId: 'target' },
    ]);
    deleteVolume.mockRejectedValueOnce(new Error('disk error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(store.deleteFavoredVolumes('target')).rejects.toThrow(
      '清空收藏夹失败，1本未删除',
    );
    expect(deleteVolume.mock.calls).toEqual([
      ['first.txt'],
      ['second.txt'],
      ['new.txt'],
    ]);
    expect(store.volumes.map((volume) => volume.id)).toEqual([
      'first.txt',
      'other.txt',
    ]);
  });
});
