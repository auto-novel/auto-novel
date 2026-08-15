import { CrawlerHttpError } from '@auto-novel/crawler';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CrawlerService } from '@/services/crawler';
import { ProxyManager } from '@/services/proxy/manager';
import { ProxyStore } from '@/services/proxy/store';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  options: [] as Array<Record<string, unknown>>,
}));

vi.mock('impit', () => ({
  Impit: class {
    constructor(options: Record<string, unknown>) {
      mocks.options.push(options);
    }

    fetch(input: string | URL | Request, init?: RequestInit) {
      return mocks.fetch(input, init);
    }
  },
}));

describe('CrawlerService', () => {
  const stores: ProxyStore[] = [];

  afterEach(() => {
    mocks.fetch.mockReset();
    mocks.options.length = 0;
    while (stores.length) {
      stores.pop()?.close();
    }
  });

  test('uses the current crawler facade and shares provider cookies', async () => {
    const service = createService({
      default: { 'User-Agent': 'daemon-test' },
      alphapolis: { Accept: 'text/html' },
    });

    await expect(service.getRank('alphapolis', {})).resolves.toEqual({
      items: [],
      pageNumber: 0,
    });
    await service.getRank('alphapolis', {});

    expect(mocks.options).toHaveLength(2);
    expect(mocks.options[0]).toMatchObject({
      browser: 'chrome',
      followRedirects: true,
      timeout: 30_000,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'daemon-test',
      },
    });
    expect(mocks.options[0]?.cookieJar).toBe(mocks.options[1]?.cookieJar);
  });

  test('lets crawler translate upstream HTTP failures', async () => {
    mocks.fetch.mockResolvedValue(
      createImpitResponse('upstream unavailable', 503, 'Service Unavailable'),
    );
    const service = createService();

    const task = service.getRank('kakuyomu', {
      genre: '综合',
      range: '每日',
      status: '全部',
    });

    await expect(task).rejects.toMatchObject({
      status: 503,
      url: expect.stringContaining('kakuyomu.jp/rankings'),
    });
    await expect(task).rejects.toBeInstanceOf(CrawlerHttpError);
  });

  function createService(
    headers?: ConstructorParameters<typeof CrawlerService>[0]['headers'],
  ) {
    const store = new ProxyStore(':memory:');
    stores.push(store);
    return new CrawlerService({
      proxyManager: new ProxyManager({ store }),
      headers,
    });
  }
});

function createImpitResponse(body: string, status: number, statusText: string) {
  const response = new Response(body, { status, statusText });
  return {
    body: response.body,
    headers: response.headers,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: 'https://example.test',
  };
}
