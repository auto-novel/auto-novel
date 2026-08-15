import * as z from 'zod';

export const PROVIDER_IDS = [
  'alphapolis',
  'hameln',
  'kakuyomu',
  'novelup',
  'pixiv',
  'syosetu',
] as const;

export const PROVIDER_CONFIG_IDS = ['default', ...PROVIDER_IDS] as const;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export const ProviderConfigIdSchema = z.enum(PROVIDER_CONFIG_IDS);

export type ProviderId = z.infer<typeof ProviderIdSchema>;
