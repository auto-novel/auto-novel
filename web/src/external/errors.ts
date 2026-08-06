const MINIMAL_ADDON_VERSION = '0.0.0';

function normalizeVersion(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;

  return [
    Number.parseInt(match[1] ?? '0', 10),
    Number.parseInt(match[2] ?? '0', 10),
    Number.parseInt(match[3] ?? '0', 10),
  ];
}

export function compareVersion(version: string, target: string): number | null {
  const left = normalizeVersion(version);
  const right = normalizeVersion(target);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }

  return 0;
}

export class AddonNotFoundError extends Error {
  constructor() {
    super(
      '未检测到机翻站插件，请安装后重试，参见：github.com/auto-novel/addon',
    );
    this.name = new.target.name;
  }
}

export class AddonVersionError extends Error {
  constructor(readonly version: string) {
    super(
      `机翻站插件版本过低或格式非法（当前：${version}），请升级后重试，参见：github.com/auto-novel/addon`,
    );
    this.name = new.target.name;
  }
}

export function assertAddonVersion(version: string): void {
  const result = compareVersion(version, MINIMAL_ADDON_VERSION);
  if (result == null || result < 0) {
    throw new AddonVersionError(version);
  }
}
