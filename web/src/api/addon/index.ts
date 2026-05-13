import { lazy } from '@/util';
export * from './WebNovelCrawlerApi';

import semver from 'semver';

// FIXME(kuriko): 临时测试用，后续需要修复
const MINIMAL_ADDON_VERSION = '1.0.0';

export class AddonVersionException extends Error {
  constructor(readonly version: string) {
    super(
      `需要更新扩展程序，当前版本 ${version}，网站最低支持版本 ${MINIMAL_ADDON_VERSION}`,
    );
    this.name = 'AddonVersionException';
  }
}
export const getAddon = lazy(async () => {
  const addon = window.Addon;
  if (!addon) return undefined;

  const info = await addon.info();
  const version = info.version.replace(/^v/, '');
  if (semver.lt(version, MINIMAL_ADDON_VERSION)) {
    throw new AddonVersionException(version);
  }
  return addon;
});
