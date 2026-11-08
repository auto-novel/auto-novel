import type { SegmentCache } from '@auto-novel/translator';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

type StoreName = 'gpt-seg-cache' | 'sakura-seg-cache';
type CacheEntry = {
  key: string;
  translatedLines: string[];
  lastAccessedAt: number;
};
type CacheStore = {
  key: string;
  value: CacheEntry;
  indexes: { lastAccessedAt: number };
};
interface CacheDatabase extends DBSchema {
  'gpt-seg-cache': CacheStore;
  'sakura-seg-cache': CacheStore;
}

const DEFAULT_MAX_ENTRIES = 5_000;
let connection: Promise<IDBPDatabase<CacheDatabase>> | undefined;

function getDatabase() {
  connection ??= openDB<CacheDatabase>('auto-novel:segment-cache', 1, {
    upgrade(db) {
      for (const name of ['gpt-seg-cache', 'sakura-seg-cache'] as const) {
        db.createObjectStore(name, { keyPath: 'key' }).createIndex(
          'lastAccessedAt',
          'lastAccessedAt',
        );
      }
    },
    blocking() {
      void connection?.then((db) => db.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

/** 新版专用库；GPT、Sakura 分表，LRU 和清空互不影响，不读取旧缓存。 */
export class IndexedDbSegmentCache implements SegmentCache {
  constructor(
    private storeName: StoreName,
    private maxEntries = DEFAULT_MAX_ENTRIES,
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('缓存条目上限必须为正整数');
    }
  }

  get(key: string): Promise<string[] | undefined> {
    return this.access(key);
  }

  async set(key: string, translatedLines: readonly string[]): Promise<void> {
    await this.access(key, [...translatedLines]);
  }

  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.clear(this.storeName);
  }

  private async access(
    key: string,
    translatedLines?: string[],
  ): Promise<string[] | undefined> {
    const db = await getDatabase();
    // 更新访问时间与淘汰在同一事务内完成，多实例／标签页也不会突破条目上限。
    const tx = db.transaction(this.storeName, 'readwrite');
    try {
      const entry: CacheEntry | undefined =
        translatedLines === undefined
          ? await tx.store.get(key)
          : { key, translatedLines, lastAccessedAt: 0 };
      if (entry) {
        const index = tx.store.index('lastAccessedAt');
        const latest = await index.openCursor(null, 'prev');
        // 毫秒内的多次访问和系统时钟回拨仍保持严格 LRU 顺序。
        entry.lastAccessedAt = Math.max(
          Date.now(),
          (latest?.value.lastAccessedAt ?? 0) + 1,
        );
        await tx.store.put(entry);
        if (translatedLines !== undefined) {
          let excess = (await tx.store.count()) - this.maxEntries;
          let cursor = excess > 0 ? await index.openCursor() : null;
          while (cursor && excess > 0) {
            await cursor.delete();
            excess--;
            if (excess > 0) cursor = await cursor.continue();
          }
        }
      }
      await tx.done;
      return entry?.translatedLines;
    } catch (error) {
      // 同时接住事务的拒绝；异常交给流水线降级，不能留下未处理的 Promise。
      try {
        tx.abort();
      } catch {
        // 事务可能已自动中止或完成。
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
