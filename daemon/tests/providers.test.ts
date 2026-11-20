import {
  Alphapolis,
  Hameln,
  Kakuyomu,
  Novelup,
  Pixiv,
  Syosetu,
} from '@auto-novel/crawler';
import ky from 'ky';
import { describe, expect, test, vi } from 'vite-plus/test';

import { ConfigSchema } from '@/config';
import {
  getProviderFactory,
  PROVIDER_IDS,
  ProviderIdSchema,
  Providers,
  type ProviderId,
} from '@/providers';
import {
  CrawlerService,
  HeadersByProviderConfigSchema,
} from '@/services/crawler';
import { ProxyManager, ProxyStore } from '@/services/proxy';

describe('daemon provider registry', () => {
  test('keeps the six provider IDs, implementations and injected client', () => {
    const implementations = {
      alphapolis: Alphapolis,
      hameln: Hameln,
      kakuyomu: Kakuyomu,
      novelup: Novelup,
      pixiv: Pixiv,
      syosetu: Syosetu,
    };
    const fetch = vi.fn();
    const client = ky.create({ fetch });

    expect(PROVIDER_IDS).toEqual(Object.keys(implementations));
    expect(ProviderIdSchema.options).toEqual(PROVIDER_IDS);
    expect(Object.keys(Providers)).toEqual(PROVIDER_IDS);
    for (const providerId of PROVIDER_IDS) {
      const factory = getProviderFactory(providerId)!;
      const provider = factory(client);
      expect(provider).toBeInstanceOf(implementations[providerId]);
      expect(provider.id).toBe(providerId);
      expect(provider.client).toBe(client);
    }
    expect(Providers.syosetu(client)).toMatchObject({
      options: { concurrency: 2 },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('performs requests through the custom ky fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response('<p id="episode_content">offline chapter</p>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    const provider = Providers.novelup(ky.create({ fetch, retry: 0 }));

    await expect(provider.getChapter('novel', 'chapter')).resolves.toEqual({
      paragraphs: ['offline chapter'],
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://novelup.plus/story/novel/chapter',
    });
  });

  test('allows default headers in config without making default a provider', () => {
    const providerConfig = {
      default: { headers: { 'User-Agent': 'offline-test' } },
      syosetu: { headers: {} },
    };
    expect(ConfigSchema.parse({ providerConfig }).providerConfig).toEqual(
      providerConfig,
    );
    expect(
      HeadersByProviderConfigSchema.parse({ default: { Accept: 'text/html' } }),
    ).toEqual({ default: { Accept: 'text/html' } });
    expect(
      ConfigSchema.safeParse({ providerConfig: { unknown: { headers: {} } } })
        .success,
    ).toBe(false);
  });

  test('rejects unknown and inherited provider names before choosing a proxy', async () => {
    const store = new ProxyStore(':memory:');
    try {
      const proxyManager = new ProxyManager({ store });
      const pick = vi.spyOn(proxyManager, 'pick');
      const service = new CrawlerService({ proxyManager });

      for (const providerId of [
        'unknown',
        'toString',
        '__proto__',
        'default',
      ]) {
        expect(ProviderIdSchema.safeParse(providerId).success).toBe(false);
        expect(getProviderFactory(providerId)).toBeUndefined();
        await expect(
          service.getMetadata(providerId as ProviderId, 'novel'),
        ).rejects.toThrow(`Unknown providerId: ${providerId}`);
      }
      expect(pick).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
});
