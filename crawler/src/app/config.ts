import path from 'node:path';
import fs from 'fs/promises';

import * as z from 'zod';
import { HeaderSchema, ProxyConfigSchema } from '@/services';
import { ProviderIdSchema } from '@/index';

export const ProviderConfigSchema = z.object({
  headers: HeaderSchema.optional(),
});

export const ConfigSchema = z
  .object({
    host: z.string().default('127.0.0.1'),
    port: z.number().default(3000),
    proxyDbPath: z.string().default('crawler-proxies.db'),
    defaultProxies: z.array(ProxyConfigSchema).default([]),
    providerConfig: z
      .partialRecord(ProviderIdSchema, ProviderConfigSchema)
      .optional(),
  })
  .strict();

export type AppConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: AppConfig = ConfigSchema.parse({});

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const raw = await fs.readFile(configPath, 'utf-8').catch(() => null);
  const parsed = parseConfig(raw);
  const config = ConfigSchema.parse(parsed);
  if (shouldPersistDefaults(raw, parsed)) {
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    await fs
      .mkdir(path.dirname(configPath), { recursive: true })
      .catch(() => undefined);
    await fs
      .writeFile(configPath, JSON.stringify(merged, null, 2))
      .catch((error) => {
        console.error('Failed to write config file:', error);
      });
  }

  return config;
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn(
      'Invalid config file, using defaults:',
      (error as Error).message,
    );
  }
  return {};
}

function shouldPersistDefaults(
  raw: string | null,
  parsed: Record<string, unknown>,
) {
  if (!raw) {
    return true;
  }
  return Object.keys(DEFAULT_CONFIG).some((key) => !(key in parsed));
}
