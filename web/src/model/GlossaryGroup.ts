export type GlossaryEntry = { jp: string; zh: string };

export type GlossaryGroupMap = Record<string, GlossaryEntry[]>;

const STORAGE_KEY_PREFIX = 'glossary-groups-';

const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4MB 保守上限

function storageKey(novelId: string): string {
  return `${STORAGE_KEY_PREFIX}${novelId}`;
}

const ORDER_KEY = '_order';

function readStoredOrder(novelId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(novelId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const order = parsed[ORDER_KEY];
    return Array.isArray(order) ? order : [];
  } catch {
    return [];
  }
}

export namespace GlossaryGroup {
  export function storageKeyFor(novelId: string): string {
    return storageKey(novelId);
  }

  export function getGroupOrder(novelId: string): string[] {
    return readStoredOrder(novelId);
  }

  export function getGroups(novelId: string): GlossaryGroupMap {
    try {
      const raw = localStorage.getItem(storageKey(novelId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const { [ORDER_KEY]: _order, ...groups } = parsed;
      return groups as GlossaryGroupMap;
    } catch {
      return {};
    }
  }

  export function saveGroups(
    novelId: string,
    groups: GlossaryGroupMap,
    order?: string[],
  ): boolean {
    const newOrder =
      order ?? readStoredOrder(novelId).filter((k) => k in groups);
    for (const key of Object.keys(groups)) {
      if (!newOrder.includes(key)) newOrder.push(key);
    }
    const data = { [ORDER_KEY]: newOrder, ...groups };
    const json = JSON.stringify(data);
    if (json.length > MAX_STORAGE_BYTES) {
      console.warn(`分组数据过大 (${json.length} bytes)，放弃保存`);
      return false;
    }
    try {
      localStorage.setItem(storageKey(novelId), json);
      return true;
    } catch (e) {
      console.warn('localStorage 写入失败，可能已满', e);
      return false;
    }
  }

  export function clearGroups(novelId: string): void {
    localStorage.removeItem(storageKey(novelId));
  }

  /** 从所有分组中移除某个术语 */
  export function removeTerm(novelId: string, jp: string): void {
    const groups = getGroups(novelId);
    let changed = false;
    for (const name of Object.keys(groups)) {
      const before = groups[name].length;
      groups[name] = groups[name].filter((e) => e.jp !== jp);
      if (groups[name].length !== before) changed = true;
      if (groups[name].length === 0) delete groups[name];
    }
    if (changed) saveGroups(novelId, groups);
  }

  /** 将术语移入指定分组（自动从旧分组移除） */
  export function moveTerm(
    novelId: string,
    jp: string,
    zh: string,
    groupName: string,
  ): void {
    const groups = getGroups(novelId);
    removeTermFromAll(groups, jp);
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({ jp, zh });
    saveGroups(novelId, groups);
  }

  function removeTermFromAll(groups: GlossaryGroupMap, jp: string): void {
    for (const name of Object.keys(groups)) {
      groups[name] = groups[name].filter((e) => e.jp !== jp);
      if (groups[name].length === 0) delete groups[name];
    }
  }

  /** 获取术语所属的分组名，不在任何分组返回 undefined */
  export function findGroup(
    groups: GlossaryGroupMap,
    jp: string,
  ): string | undefined {
    for (const [name, entries] of Object.entries(groups)) {
      if (entries.some((e) => e.jp === jp)) return name;
    }
    return undefined;
  }

  export function renameGroup(
    novelId: string,
    oldName: string,
    newName: string,
  ): boolean {
    const groups = getGroups(novelId);
    if (groups[newName] || !groups[oldName]) return false;
    groups[newName] = groups[oldName];
    delete groups[oldName];
    saveGroups(novelId, groups);
    return true;
  }

  export function deleteGroup(novelId: string, groupName: string): void {
    const groups = getGroups(novelId);
    delete groups[groupName];
    saveGroups(novelId, groups);
  }

  export function addEmptyGroup(novelId: string, groupName: string): boolean {
    const groups = getGroups(novelId);
    if (groups[groupName]) return false;
    groups[groupName] = [];
    saveGroups(novelId, groups);
    return true;
  }

  /** 交叉比对：返回增补后的显示数据 */
  export function buildDisplayData(
    groups: GlossaryGroupMap,
    serverGlossary: Record<string, string>,
    order?: string[],
  ): GlossaryGroupMap {
    const result: GlossaryGroupMap = {};
    const groupedJps = new Set<string>();

    const names = order ?? Object.keys(groups);
    for (const name of names) {
      const entries = groups[name];
      if (!entries) continue;
      result[name] = entries.map((e) => {
        groupedJps.add(e.jp);
        if (e.jp in serverGlossary) {
          return { jp: e.jp, zh: serverGlossary[e.jp] };
        }
        return e;
      });
    }

    // 未分组术语（在服务端但不在任何分组中）
    const ungrouped: GlossaryEntry[] = [];
    for (const jp of Object.keys(serverGlossary)) {
      if (!groupedJps.has(jp)) {
        ungrouped.push({ jp, zh: serverGlossary[jp] });
      }
    }
    if (ungrouped.length > 0) {
      result['未分组'] = ungrouped;
    }

    return result;
  }
}
