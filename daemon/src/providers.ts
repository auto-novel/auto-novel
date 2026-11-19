import {
  Alphapolis,
  Hameln,
  Kakuyomu,
  Novelup,
  Pixiv,
  Syosetu,
  type WebNovelProvider,
} from '@auto-novel/crawler';
import type { KyInstance } from 'ky';
import z from 'zod';

// 注册表属于 daemon：crawler 只提供 provider 实现，不再提供旧的全局工厂 API。
export const PROVIDER_IDS = [
  'alphapolis',
  'hameln',
  'kakuyomu',
  'novelup',
  'pixiv',
  'syosetu',
] as const;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

// default 仅用于共享请求头配置，不是可通过 HTTP 调用的 provider。
export const ProviderConfigIdSchema = z.enum([...PROVIDER_IDS, 'default']);

export const Providers = {
  alphapolis: (client: KyInstance) => new Alphapolis(client),
  hameln: (client: KyInstance) => new Hameln(client),
  kakuyomu: (client: KyInstance) => new Kakuyomu(client),
  novelup: (client: KyInstance) => new Novelup(client),
  pixiv: (client: KyInstance) => new Pixiv(client),
  syosetu: (client: KyInstance) => new Syosetu(client, { concurrency: 2 }),
} satisfies Record<ProviderId, (client: KyInstance) => WebNovelProvider>;

export function getProviderFactory(providerId: string) {
  return Object.hasOwn(Providers, providerId)
    ? Providers[providerId as ProviderId]
    : undefined;
}
