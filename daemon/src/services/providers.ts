import { WEB_NOVEL_PROVIDER_IDS } from '@auto-novel/crawler';
import * as z from 'zod';

export const PROVIDER_CONFIG_IDS = [
  'default',
  ...WEB_NOVEL_PROVIDER_IDS,
] as const;

export const ProviderIdSchema = z.enum(WEB_NOVEL_PROVIDER_IDS);
export const ProviderConfigIdSchema = z.enum(PROVIDER_CONFIG_IDS);

export type ProviderId = z.infer<typeof ProviderIdSchema>;
