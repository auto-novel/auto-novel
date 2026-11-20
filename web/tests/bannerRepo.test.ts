import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';

import { objectPosition } from '../src/repos/useBanner';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api', () => ({ BannerApi: { list } }));
// 使用 web-kit 的真实存储实现，避免加载无关 UI 组件。
vi.mock('@novelia/web-kit', async () => {
  const { useLocalStorage } =
    await import('../node_modules/@novelia/web-kit/src/utils/storage');
  return { useLocalStorage };
});

const storageKey = 'auto-novel:banner:v1';
const hour = 60 * 60 * 1000;
const banners = [1, 2].map((id) => ({
  id,
  type: 0,
  imageUrl: `/banner-${id}.webp`,
  linkUrl: null,
  focalX: 0.5,
  focalY: 0.5,
  sortOrder: id,
}));

let store: Map<string, string>;
const stored = () => JSON.parse(store.get(storageKey)!);
const loadRepo = async () =>
  (await import('../src/repos/useBanner')).BannerRepo;
// 模拟刷新页面：重新求值模块，复用已持久化的存储内容。
const reloadRepo = async () => {
  vi.resetModules();
  return loadRepo();
};

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: vi.fn(),
  });
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.resetModules();
  list.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BannerRepo', () => {
  it('shares in-flight requests and persists the list across reloads for 12 hours', async () => {
    list.mockResolvedValue(banners);
    let repo = await loadRepo();
    const first = repo.list();
    expect(repo.list()).toBe(first);
    await expect(first).resolves.toEqual(banners);
    expect(list).toHaveBeenCalledTimes(1);

    repo = await reloadRepo();
    vi.advanceTimersByTime(12 * hour - 1);
    await expect(repo.list()).resolves.toEqual(banners);
    expect(list).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await repo.list();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rotates the selection every 2 hours and wraps, without extra requests', async () => {
    list.mockResolvedValue(banners);
    let repo = await loadRepo();
    expect(repo.peek()).toBeUndefined();

    // 首次访问：无选中项，顺延到第一张并持久化。
    expect(await repo.current()).toEqual({
      banner: banners[0],
      expiresAt: 2 * hour,
    });
    expect(stored()).toEqual({
      list: { banners, expiresAt: 12 * hour },
      selection: { bannerId: 1, expiresAt: 2 * hour },
    });

    repo = await reloadRepo();
    expect(repo.peek()?.banner.id).toBe(1);

    vi.advanceTimersByTime(2 * hour - 1);
    expect((await repo.current())?.banner.id).toBe(1);
    expect(repo.peek()?.banner.id).toBe(1);
    // 选中项到期后 peek 不再返回缓存。
    vi.advanceTimersByTime(1);
    expect(repo.peek()).toBeUndefined();
    expect(await repo.current()).toEqual({
      banner: banners[1],
      expiresAt: 4 * hour,
    });
    vi.advanceTimersByTime(2 * hour);
    expect((await repo.current())?.banner.id).toBe(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('manually advances before expiry, persists the choice and wraps', async () => {
    list.mockResolvedValue(banners);
    let repo = await loadRepo();
    await repo.current();
    vi.advanceTimersByTime(hour);
    expect(await repo.current(true)).toEqual({
      banner: banners[1],
      expiresAt: 3 * hour,
    });
    repo = await reloadRepo();
    expect(repo.peek()?.banner.id).toBe(2);
    expect((await repo.current())?.banner.id).toBe(2);
    expect((await repo.current(true))?.banner.id).toBe(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('refreshes on manual switching after one minute and shares requests', async () => {
    const added = { ...banners[1], id: 3, imageUrl: '/banner-3.webp' };
    list.mockResolvedValueOnce(banners).mockResolvedValue([banners[0], added]);
    let repo = await loadRepo();
    await repo.current();
    vi.advanceTimersByTime(60_000 - 1);
    expect((await repo.current(true))?.banner.id).toBe(2);
    expect(list).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    const refresh = repo.list(true);
    expect(repo.list(true)).toBe(refresh);
    await refresh;
    expect((await repo.current(true))?.banner.id).toBe(1);
    expect((await repo.current(true))?.banner.id).toBe(3);
    expect(list).toHaveBeenCalledTimes(2);
    repo = await reloadRepo();
    await repo.current(true);
    expect(list).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    await repo.current();
    expect(list).toHaveBeenCalledTimes(2);
    await repo.current(true);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('uses the old list when a manual refresh fails and cools down retries', async () => {
    list.mockResolvedValueOnce(banners).mockRejectedValue(new Error('offline'));
    const repo = await loadRepo();
    await repo.current();
    const cached = stored().list;
    vi.advanceTimersByTime(60_000);
    expect((await repo.current(true))?.banner.id).toBe(2);
    expect(stored().list).toEqual(cached);
    expect((await repo.current(true))?.banner.id).toBe(1);
    expect(list).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect((await repo.current(true))?.banner.id).toBe(2);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('handles manual switching with one or no banners', async () => {
    list.mockResolvedValueOnce([banners[0]]).mockResolvedValueOnce([]);
    const repo = await loadRepo();
    expect((await repo.current(true))?.banner.id).toBe(1);
    expect((await repo.current(true))?.banner.id).toBe(1);
    vi.advanceTimersByTime(12 * hour);
    expect(await repo.current(true)).toBeUndefined();
    expect(repo.peek()).toBeUndefined();
  });

  it('keeps the selection and its expiry when the list refreshes', async () => {
    const updated = { ...banners[0], imageUrl: '/updated.webp' };
    list
      .mockResolvedValueOnce(banners)
      .mockResolvedValueOnce([updated, banners[1]]);
    const repo = await loadRepo();
    await repo.list();
    vi.advanceTimersByTime(11 * hour);
    await repo.current();
    vi.advanceTimersByTime(hour);
    expect(repo.peek()?.banner).toEqual(banners[0]);
    expect(await repo.current()).toEqual({
      banner: banners[0],
      expiresAt: 13 * hour,
    });
    await repo.list(true); // 等待共享的后台刷新完成。
    expect(await repo.current()).toEqual({
      banner: updated,
      expiresAt: 13 * hour,
    });
    vi.advanceTimersByTime(hour);
    expect((await repo.current())?.banner.id).toBe(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('drops the selection when banners disappear, then when the list is empty', async () => {
    list
      .mockResolvedValueOnce(banners)
      .mockResolvedValueOnce([banners[1]])
      .mockResolvedValue([]);
    const repo = await loadRepo();
    await repo.current();

    // 选中项被移除：顺延到列表中的下一张。
    vi.advanceTimersByTime(12 * hour);
    expect((await repo.current())?.banner.id).toBe(2);
    vi.advanceTimersByTime(2 * hour);
    expect((await repo.current())?.banner.id).toBe(2);

    // 列表变空：刷新期间仍用旧列表，完成后清除选中项，空列表也照样缓存。
    vi.advanceTimersByTime(10 * hour);
    expect((await repo.current())?.banner.id).toBe(2);
    await repo.list(true);
    expect(await repo.current()).toBeUndefined();
    expect(await repo.current()).toBeUndefined();
    expect(stored()).toEqual({ list: { banners: [], expiresAt: 36 * hour } });
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('serves expired lists without waiting and shares the background refresh', async () => {
    list.mockResolvedValueOnce(banners);
    const repo = await loadRepo();
    await repo.current();
    vi.advanceTimersByTime(12 * hour);
    const updated = [{ ...banners[0], imageUrl: '/updated.webp' }];
    let resolve!: (value: typeof banners) => void;
    list.mockImplementationOnce(
      () => new Promise<typeof banners>((done) => (resolve = done)),
    );

    await expect(repo.list()).resolves.toEqual(banners);
    expect((await repo.current())?.banner.id).toBe(2);
    const refresh = repo.list(true);
    expect(repo.list(true)).toBe(refresh);
    expect(list).toHaveBeenCalledTimes(2);
    resolve(updated);
    await refresh;
    expect((await repo.current())?.banner).toEqual(updated[0]);
  });

  it('keeps expired lists after background failures and cools down retries', async () => {
    list.mockResolvedValueOnce(banners).mockRejectedValue(new Error('offline'));
    let repo = await loadRepo();
    await repo.list();
    vi.advanceTimersByTime(11 * hour);
    await repo.current();
    vi.advanceTimersByTime(hour);
    repo = await reloadRepo();
    expect(repo.peek()?.banner.id).toBe(1);
    const cached = stored().list;
    await expect(repo.list()).resolves.toEqual(banners);
    await repo.list(true);
    expect(stored().list).toEqual(cached);
    expect((await repo.current())?.banner.id).toBe(1);
    expect(list).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    await repo.list();
    await repo.list(true);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('does not cache failed requests and allows retrying', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(banners);
    const repo = await loadRepo();
    await expect(repo.current()).rejects.toThrow('offline');
    expect((await repo.current())?.banner.id).toBe(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it.each([
    '{broken',
    JSON.stringify({ list: { banners: 'invalid', expiresAt: 1000 } }),
    JSON.stringify({ selection: { bannerId: 'invalid', expiresAt: 1000 } }),
  ])('recovers from invalid persisted values: %s', async (raw) => {
    store.set(storageKey, raw);
    list.mockResolvedValue(banners);
    const repo = await loadRepo();
    expect((await repo.current())?.banner.id).toBe(1);
    expect(stored().list.banners).toEqual(banners);
  });

  it('falls back to in-memory rotation when localStorage is unavailable', async () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
    });
    list.mockResolvedValue(banners);
    const repo = await loadRepo();
    await repo.current();
    vi.advanceTimersByTime(2 * hour);
    expect((await repo.current())?.banner.id).toBe(2);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('objectPosition', () => {
  const image = { width: 1600, height: 400 };

  it('centers the image for the middle focal point', () => {
    expect(
      objectPosition(image, { width: 800, height: 300 }, { x: 0.5, y: 0.5 }),
    ).toBe('50% 50%');
  });

  it('moves only the axis that overflows the container', () => {
    // 800x300：高度撑满，焦点只影响水平方向。
    expect(
      objectPosition(image, { width: 800, height: 300 }, { x: 0, y: 0 }),
    ).toBe('0% 50%');
    expect(
      objectPosition(image, { width: 800, height: 300 }, { x: 1, y: 1 }),
    ).toBe('100% 50%');
    // 800x150：宽度撑满，焦点只影响垂直方向。
    expect(
      objectPosition(image, { width: 800, height: 150 }, { x: 0, y: 0 }),
    ).toBe('50% 0%');
    expect(
      objectPosition(image, { width: 800, height: 150 }, { x: 1, y: 1 }),
    ).toBe('50% 100%');
  });

  it('clamps out-of-range focal points and falls back to center for unknown values', () => {
    expect(
      objectPosition(image, { width: 800, height: 300 }, { x: 2, y: -1 }),
    ).toBe('100% 50%');
    expect(
      objectPosition(
        image,
        { width: 800, height: 150 },
        { x: Number.NaN, y: 0 },
      ),
    ).toBe('50% 0%');
    expect(
      objectPosition(
        { width: 0, height: 0 },
        { width: 800, height: 300 },
        { x: 0, y: 0 },
      ),
    ).toBe('50% 50%');
  });
});
