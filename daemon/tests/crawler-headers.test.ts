import { Impit } from 'impit';
import { beforeEach, expect, test, vi } from 'vite-plus/test';

import {
  CrawlerService,
  type HeadersByProviderConfig,
} from '@/services/crawler';
import { ProxyManager, ProxyStore } from '@/services/proxy';

vi.mock('impit', () => ({
  Impit: vi.fn(
    class {
      async fetch() {
        return new Response('<p id="episode_content">offline chapter</p>');
      }
    },
  ),
}));

beforeEach(() => vi.clearAllMocks());

const cases: {
  name: string;
  headers: HeadersByProviderConfig;
  expected: Record<string, string>;
}[] = [
  {
    name: 'inherits default headers without an explicit provider config',
    headers: { default: { 'User-Agent': 'shared', Accept: 'text/html' } },
    expected: { 'User-Agent': 'shared', Accept: 'text/html' },
  },
  {
    name: 'overrides provider headers while retaining other defaults',
    headers: {
      default: { 'User-Agent': 'shared', Accept: 'text/html' },
      novelup: { 'User-Agent': 'provider' },
    },
    expected: { 'User-Agent': 'provider', Accept: 'text/html' },
  },
];

test.each(cases)('$name', async ({ headers, expected }) => {
  const store = new ProxyStore(':memory:');
  try {
    const service = new CrawlerService({
      proxyManager: new ProxyManager({ store }),
      headers,
    });

    await expect(
      service.getChapter('novelup', 'novel', 'chapter'),
    ).resolves.toEqual({
      paragraphs: ['offline chapter'],
    });
    expect(Impit).toHaveBeenCalledOnce();
    expect(vi.mocked(Impit).mock.calls[0]?.[0]?.headers).toEqual(expected);
  } finally {
    store.close();
  }
});
