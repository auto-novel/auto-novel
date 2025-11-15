import type { WebNovelProvider } from '@/domain/types';
import type ky from 'ky';

import { Pixiv } from '@/domain/pixiv';
import { Syosetu } from './domain/syosetu';

type ProviderInitFn = (_: typeof ky) => WebNovelProvider;
export const Providers: Record<string, ProviderInitFn> = {
  pixiv: (ky) => new Pixiv(ky),
  syosetu: (ky) => new Syosetu(ky),
};
