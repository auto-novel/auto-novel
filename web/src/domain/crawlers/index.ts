import { Pixiv } from './pixiv';
import type { WebNovelProvider } from './types';

// FIXME(kuriko):
// 由于 Addon 是 extension 注入的，所以 new WebNovelProvider 的时候 window.Addon 可能还不可用。
// 因此目前 WebNovelProvider 内部几个函数都需要自行判断 window.Addon 是否存在。
export const Providers: Record<string, WebNovelProvider> = {
  pixiv: new Pixiv(),
};
