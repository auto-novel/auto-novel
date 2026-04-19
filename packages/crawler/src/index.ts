import type ky from 'ky';

import type { WebNovelProvider } from '@/provider/types';

import { Alphapolis } from '@/provider/alphapolis';
import { Hameln } from '@/provider/hameln';
import { Kakuyomu } from '@/provider/kakuyomu';
import { Novelup } from '@/provider/novelup';
import { Pixiv } from '@/provider/pixiv';
import { Syosetu } from '@/provider/syosetu';
import z from 'zod';

export { Alphapolis, Hameln, Kakuyomu, Novelup, Pixiv, Syosetu };
export type {
  Page,
  RemoteChapter,
  RemoteNovelListItem,
  RemoteNovelMetadata,
  TocItem,
  WebNovelAuthor,
  WebNovelProvider,
} from '@/provider/types';
export {
  emptyPage,
  NovelAccessDeniedException,
  NovelIdShouldBeReplacedException,
  NovelRateLimitedException,
  WebNovelAttention,
  WebNovelType,
} from '@/provider/types';

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
