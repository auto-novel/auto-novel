import type { Glossary } from './Glossary';

export type GlossaryHistoryType = 'submit' | 'remote-changed';

export interface GlossaryHistoryEntry {
  id: string;
  novelId: string;
  timestamp: number;
  type: GlossaryHistoryType;
  glossary: Glossary;
  termCount: number;
}

const MAX_ENTRIES = 30;

function storageKey(novelId: string): string {
  return `glossary-history-${novelId}`;
}

function deepEqual(a: Glossary, b: Glossary): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

let _keysCache: string[] | null = null;
const CACHE_DURATION = 5000;
let _cacheTime = 0;

export function getHistoryKeys(): string[] {
  if (_keysCache && Date.now() - _cacheTime < CACHE_DURATION) {
    return _keysCache;
  }
  const prefix = 'glossary-history-';
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key.slice(prefix.length));
    }
  }
  _keysCache = keys;
  _cacheTime = Date.now();
  return keys;
}

function invalidateKeysCache() {
  _keysCache = null;
}

export function getHistory(novelId: string): GlossaryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(novelId));
    if (!raw) return [];
    return JSON.parse(raw) as GlossaryHistoryEntry[];
  } catch {
    return [];
  }
}

export function addHistory(
  novelId: string,
  entry: Omit<
    GlossaryHistoryEntry,
    'id' | 'timestamp' | 'novelId' | 'termCount'
  > & {
    glossary: Glossary;
    type: GlossaryHistoryType;
  },
): boolean {
  const items = getHistory(novelId);

  // 去重：与最近一条 deep compare
  const latest = items[items.length - 1];
  if (latest && deepEqual(latest.glossary, entry.glossary)) {
    return false;
  }

  const full: GlossaryHistoryEntry = {
    id: crypto.randomUUID(),
    novelId,
    timestamp: Date.now(),
    type: entry.type,
    glossary: entry.glossary,
    termCount: Object.keys(entry.glossary).length,
  };

  items.push(full);
  while (items.length > MAX_ENTRIES) items.shift();

  localStorage.setItem(storageKey(novelId), JSON.stringify(items));
  invalidateKeysCache();
  return true;
}

export function deleteHistory(novelId: string, entryId: string): void {
  let items = getHistory(novelId);
  items = items.filter((e) => e.id !== entryId);
  if (items.length === 0) {
    localStorage.removeItem(storageKey(novelId));
    invalidateKeysCache();
  } else {
    localStorage.setItem(storageKey(novelId), JSON.stringify(items));
  }
}

export function clearHistory(novelId: string): void {
  localStorage.removeItem(storageKey(novelId));
  invalidateKeysCache();
}

export function getLatestGlossary(novelId: string): Glossary | null {
  const items = getHistory(novelId);
  if (items.length === 0) return null;
  return items[items.length - 1].glossary;
}
