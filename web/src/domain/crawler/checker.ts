import { getAddon } from '@/api/addon';
import { lazy } from '@/util';

// 检查是否触发 CF 墙
export class CFWallException extends Error {
  constructor() {
    super('触发 CF 墙，请访问小说原站页面，完成人机验证后重试');
    this.name = 'CFWallException';
  }
}
export function CheckCFWall(html: string) {
  if (html.includes('#challenge-error-text')) {
    throw new CFWallException();
  }
}

// 检查 Hameln 是否解除 R18 限制
export class HamelnR18Exception extends Error {
  constructor() {
    super('Hameln 未开启 R18，请开启后刷新页面重试');
    this.name = 'HamelnR18Exception';
  }
}
export async function CheckHamelnR18() {
  const addon = await getAddon();

  const ret = await addon.cookiesStatus({
    url: 'https://syosetu.org',
    domain: 'syosetu.org',
    keys: ['over18'],
  });
  if (ret['over18'].value !== 'off') {
    throw new HamelnR18Exception();
  }
}

// 检查 Pixiv 是否开启 R18
export class PixivLoginException extends Error {
  constructor() {
    super('Pixiv 账号未登录，请登录后刷新页面重试');
    this.name = 'PixivLoginException';
  }
}
export class PixivR18Exception extends Error {
  constructor() {
    super('Pixiv 未开启 R18G，请开启后刷新页面重试');
    this.name = 'PixivR18Exception';
  }
}
export const CheckPixivR18 = lazy(async () => {
  const addon = await getAddon();

  const resp = await addon.fetch('https://www.pixiv.net/settings/viewing');

  const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
  const isEnableSensitiveView = (
    doc.querySelector(
      'input[name=sensitive_view_setting]',
    ) as HTMLInputElement | null
  )?.checked;
  const isEnableR18 = (
    doc.querySelector('input[name=r18]') as HTMLInputElement | null
  )?.checked;
  const isEnableR18G = (
    doc.querySelector('input[name=r18g]') as HTMLInputElement | null
  )?.checked;

  if (
    isEnableSensitiveView === undefined ||
    isEnableR18 === undefined ||
    isEnableR18G === undefined
  ) {
    throw new PixivLoginException();
  }

  if (!(isEnableSensitiveView && isEnableR18 && isEnableR18G)) {
    throw new PixivR18Exception();
  }
});
