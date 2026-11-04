export type WebTranslateTaskDesc = {
  type: 'web';
  providerId: string;
  novelId: string;
};

export type WenkuTranslateTaskDesc = {
  type: 'wenku';
  novelId: string;
  volumeId: string;
};

export type LocalTranslateTaskDesc = {
  type: 'local';
  volumeId: string;
};

export type TranslateTaskDesc =
  | WebTranslateTaskDesc
  | WenkuTranslateTaskDesc
  | LocalTranslateTaskDesc;

export type TranslateTaskParams = {
  level: 'normal' | 'expire' | 'all' | 'sync'; // 翻译等级
  forceMetadata: boolean; // 强制重翻元数据
  useBrowserCrawler: boolean; // 是否启用浏览器爬虫
  startIndex: number;
  endIndex: number;
};

/** 调用方可省略章节范围，进入执行层前统一补齐。 */
export type TranslateTaskOptions = Omit<
  TranslateTaskParams,
  'startIndex' | 'endIndex'
> &
  Partial<Pick<TranslateTaskParams, 'startIndex' | 'endIndex'>>;

/** 默认结束位置（不含）；读取旧任务时不截断显式范围。 */
const DEFAULT_TASK_END_INDEX = 65535;

const isLevel = (value: unknown): value is TranslateTaskParams['level'] =>
  value === 'normal' ||
  value === 'expire' ||
  value === 'all' ||
  value === 'sync';

const validateParams = (params: TranslateTaskParams) => {
  if (!isLevel(params.level)) throw new Error('无效的翻译等级');
  if (
    typeof params.forceMetadata !== 'boolean' ||
    typeof params.useBrowserCrawler !== 'boolean'
  ) {
    throw new Error('无效的翻译选项');
  }
  if (
    !Number.isSafeInteger(params.startIndex) ||
    !Number.isSafeInteger(params.endIndex) ||
    params.startIndex < 0 ||
    params.endIndex < params.startIndex
  ) {
    throw new Error('无效的章节范围');
  }
};

const decodeVolumeId = (value: string): string => {
  const id = decodeURIComponent(value);
  if (!id.trim()) throw new Error('无效的翻译任务路径');
  return id;
};

const parsePath = (path: string): TranslateTaskDesc => {
  const [type, first, second, ...extra] = path.split('/');
  if (!first?.trim() || extra.length > 0 || /[?#]/.test(path)) {
    throw new Error('无效的翻译任务路径');
  }
  if (type === 'web' && second?.trim()) {
    return { type, providerId: first, novelId: second };
  }
  if (type === 'wenku' && second?.trim()) {
    return { type, novelId: first, volumeId: decodeVolumeId(second) };
  }
  // 保留历史本地小说任务前缀。
  if (
    (type === 'local' || type === 'personal' || type === 'personal2') &&
    second === undefined
  ) {
    return { type: 'local', volumeId: decodeVolumeId(first) };
  }
  throw new Error('无效的翻译任务路径');
};

// 供编解码和执行入口内部共用，不从领域主入口导出。
export const resolveTaskParams = (
  options: TranslateTaskOptions,
): TranslateTaskParams => {
  const params: TranslateTaskParams = {
    ...options,
    startIndex: options.startIndex ?? 0,
    endIndex: options.endIndex ?? DEFAULT_TASK_END_INDEX,
  };
  validateParams(params);
  return params;
};

const buildTask = (path: string, options: TranslateTaskOptions): string => {
  // 构建和读取使用同一套校验，避免产生无法读取的新任务。
  parsePath(path);
  const params = resolveTaskParams(options);
  // 参数顺序与旧格式一致，任务字符串仍可直接作为队列标识。
  const query = new URLSearchParams({
    level: params.level,
    forceMetadata: String(params.forceMetadata),
    useBrowserCrawler: String(params.useBrowserCrawler),
    startIndex: String(params.startIndex),
    endIndex: String(params.endIndex),
  });
  return `${path}?${query}`;
};

const parse = (
  task: string,
): {
  desc: TranslateTaskDesc;
  params: TranslateTaskParams;
} => {
  const queryIndex = task.indexOf('?');
  const path = queryIndex < 0 ? task : task.slice(0, queryIndex);
  const desc = parsePath(path);
  const query = new URLSearchParams(
    queryIndex < 0 ? '' : task.slice(queryIndex + 1),
  );
  const level = query.get('level') ?? 'normal';
  if (!isLevel(level)) throw new Error('无效的翻译等级');

  const queryBoolean = (name: string): boolean => {
    const value = query.get(name);
    if (value === null || value === 'false') return false;
    if (value === 'true') return true;
    throw new Error(`无效的翻译选项：${name}`);
  };
  const queryIndexValue = (name: string, fallback: number): number => {
    const value = query.get(name);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value)) throw new Error('无效的章节范围');
    return Number(value);
  };
  const params: TranslateTaskParams = {
    level,
    forceMetadata: queryBoolean('forceMetadata'),
    useBrowserCrawler: queryBoolean('useBrowserCrawler'),
    startIndex: queryIndexValue('startIndex', 0),
    endIndex: queryIndexValue('endIndex', DEFAULT_TASK_END_INDEX),
  };
  validateParams(params);
  return { desc, params };
};

export const TranslateTaskDescriptor = {
  web: (providerId: string, novelId: string, options: TranslateTaskOptions) =>
    buildTask(`web/${providerId}/${novelId}`, options),
  wenku: (novelId: string, volumeId: string, options: TranslateTaskOptions) =>
    buildTask(`wenku/${novelId}/${encodeURIComponent(volumeId)}`, options),
  local: (volumeId: string, options: TranslateTaskOptions) =>
    buildTask(`local/${encodeURIComponent(volumeId)}`, options),
  parse,
  formatRange: ({ startIndex, endIndex }: TranslateTaskParams): string => {
    if (startIndex === 0 && endIndex >= DEFAULT_TASK_END_INDEX) return '';
    const endLabel = endIndex < DEFAULT_TASK_END_INDEX ? endIndex : 'Inf';
    return `[${startIndex},${endLabel})`;
  },
};
