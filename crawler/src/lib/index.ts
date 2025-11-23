import type ky from 'ky';

import type { WebNovelProvider } from '@/domain/types';

import { Pixiv } from '@/domain/pixiv';
import { Syosetu } from '@/domain/syosetu';
import { Kakuyomu } from '@/domain/kakuyomu';
import { Novelup } from './domain/novelup';

type ProviderInitFn = (_: typeof ky) => WebNovelProvider;

export const PROVIDER_IDS = [
  'pixiv',
  'syosetu',
  'kakuyomu',
  'novelup',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

const providers: Record<ProviderId, ProviderInitFn> = {
  pixiv: (ky) => new Pixiv(ky),
  syosetu: (ky) => new Syosetu(ky),
  kakuyomu: (ky) => new Kakuyomu(ky),
  novelup: (ky) => new Novelup(ky),
};

export const Providers = providers;
