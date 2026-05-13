import { getAddon } from '@/api/addon';

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
export async function CheckHamelnAllowR18(): Promise<boolean | undefined> {
  const addon = await getAddon();
  if (!addon) return undefined;

  const ret = await addon.cookiesStatus({
    url: 'https://syosetu.org',
    domain: 'syosetu.org',
    keys: ['over18'],
  });
  return ret['over18'].value === 'off';
}

// 检查 Pixiv 是否登录
export async function CheckPixivLogin(): Promise<boolean> {
  //FIXME(kuriko): 未实现
  throw new Error('Not Implemented');
}

// 检查 Pixiv 是否开启 R18
export async function CheckPixivR18(): Promise<boolean> {
  //FIXME(kuriko): 未实现
  throw new Error('Not Implemented');
}

// 检查 Pixiv 是否遇到付费墙
export async function CheckPixivPaywall(): Promise<boolean> {
  //FIXME(kuriko): 未实现
  throw new Error('Not Implemented');
}
