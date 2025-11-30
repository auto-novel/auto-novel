import type ky from 'ky';

import type { WebNovelProvider } from '@/domain/types';

import { Alphapolis } from '@/domain/alphapolis';
import { Hameln } from '@/domain/hameln';
import { Kakuyomu } from '@/domain/kakuyomu';
import { Novelup } from '@/domain/novelup';
import { Pixiv } from '@/domain/pixiv';
import { Syosetu } from '@/domain/syosetu';
import z from 'zod';

type ProviderInitFn = (_: typeof ky) => WebNovelProvider;

export const PROVIDER_IDS = [
  'default',
  'alphapolis',
  'hameln',
  'kakuyomu',
  'novelup',
  'pixiv',
  'syosetu',
] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

const providers: Record<ProviderId, ProviderInitFn> = {
  default: (ky) => {
    throw new Error('Provider not specified');
  },
  alphapolis: (ky) => new Alphapolis(ky),
  hameln: (ky) => new Hameln(ky),
  pixiv: (ky) => new Pixiv(ky),
  novelup: (ky) => new Novelup(ky),
  kakuyomu: (ky) => new Kakuyomu(ky),
  syosetu: (ky) => new Syosetu(ky),
};

export const Providers = providers;
