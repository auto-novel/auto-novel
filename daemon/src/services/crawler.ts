import type {
  Page,
  WebNovelChapter,
  WebNovelListItem,
  WebNovelMetadata,
} from '@auto-novel/crawler';
import {
  Alphapolis,
  Hameln,
  Kakuyomu,
  Novelup,
  Pixiv,
  Syosetu,
  WebNovelCrawler,
} from '@auto-novel/crawler';
import {
  Impit,
  type HttpMethod,
  type ImpitOptions,
  type RequestInit as ImpitRequestInit,
} from 'impit';
import ky, { type Options } from 'ky';
import { ProxyConfig, ProxyManager, type ProxyState } from './proxy';
import {
  PROVIDER_CONFIG_IDS,
  PROVIDER_IDS,
  type ProviderId,
} from './providers';
import z from 'zod';
import { CookieJar } from 'tough-cookie';

type Fetcher = Options['fetch'];
type CrawlerHandler<T> = (crawler: WebNovelCrawler) => Promise<T>;

// Record<ProviderId, Record<headerName, headerValue>>
export const HeaderSchema = z.record(z.string(), z.string());
export type HeaderArray = z.infer<typeof HeaderSchema>;

export const HeadersByProviderConfigSchema = z.partialRecord(
  z.enum(PROVIDER_CONFIG_IDS),
  HeaderSchema,
);
export type HeadersByProviderConfig = z.infer<
  typeof HeadersByProviderConfigSchema
>;

export type CrawlerServiceOptions = {
  proxyManager: ProxyManager;
  headers?: HeadersByProviderConfig;
};

export class CrawlerService {
  private readonly proxyManager: ProxyManager;
  private readonly impitDefaults: Partial<ImpitOptions>;
  private readonly headers: Map<ProviderId, HeaderArray> = new Map();
  // TODO(kuriko): should we implement persistent cookie store?
  //    dump the cookies back to config?
  private readonly cookieJars = new Map<ProviderId, CookieJar>();

  constructor(options: CrawlerServiceOptions) {
    this.proxyManager = options.proxyManager;
    this.impitDefaults = {
      timeout: 30_000,
      browser: 'chrome',
      followRedirects: true,
    };

    const defaultHeaders = options.headers?.default ?? {};
    for (const providerId of PROVIDER_IDS) {
      const providerHeaders = options.headers?.[providerId] ?? {};
      const finalHeaders = {
        ...defaultHeaders,
        ...providerHeaders,
      };
      this.headers.set(providerId, finalHeaders);
    }
  }

  async getMetadata(
    providerId: ProviderId,
    novelId: string,
  ): Promise<WebNovelMetadata> {
    return this.fetchResource(providerId, (crawler) =>
      crawler.getMetadata(providerId, novelId),
    );
  }

  async getRank(
    providerId: ProviderId,
    params: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return this.fetchResource(providerId, (crawler) =>
      crawler.getRank(providerId, params),
    );
  }

  async getChapter(
    providerId: ProviderId,
    novelId: string,
    chapterId: string,
  ): Promise<WebNovelChapter> {
    return this.fetchResource(providerId, (crawler) =>
      crawler.getChapter(providerId, novelId, chapterId),
    );
  }

  private async fetchResource<T>(
    providerId: ProviderId,
    handler: CrawlerHandler<T>,
  ): Promise<T> {
    const proxy = this.proxyManager.pick();
    const { fetcher, finalize } = this.buildFetcher(providerId, proxy);
    const client = ky.create({ fetch: fetcher });
    const crawler = new WebNovelCrawler({
      alphapolis: () => new Alphapolis(client),
      hameln: () => new Hameln(client),
      kakuyomu: () => new Kakuyomu(client),
      novelup: () => new Novelup(client),
      pixiv: () =>
        new Pixiv(client, {
          precheckViewingSettings: false,
        }),
      syosetu: () => new Syosetu(client, { concurrency: 2 }),
    });

    try {
      const result = await handler(crawler);
      finalize(true);
      return result;
    } catch (error) {
      finalize(false);
      throw error;
    }
  }

  private buildFetcher(providerId: ProviderId, proxy: ProxyState | null) {
    const headers = this.headers.get(providerId);
    const proxyUrl = proxy ? this.buildProxyUrl(proxy.config) : undefined;
    const cookieJar = this.getCookieJar(providerId);

    const client = new Impit({
      ...this.impitDefaults,
      proxyUrl,
      cookieJar,
      headers,
    });

    const fetcher: Fetcher = async (input, init) => {
      const requestInit: ImpitRequestInit | undefined = init
        ? ({
            ...init,
            method: init.method ? (init.method as HttpMethod) : undefined,
            body: init.body === null ? undefined : init.body,
          } as ImpitRequestInit)
        : undefined;

      const method = requestInit?.method ?? 'GET';
      const url = input instanceof Request ? input.url : input;
      console.debug(
        `[Crawler.Internal] ${method} ${url} via proxy: ${proxyUrl ?? 'none'}`,
      );
      const response = await client.fetch(input, requestInit);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }) as Awaited<ReturnType<NonNullable<Fetcher>>>;
    };

    const finalize = (success: boolean) => {
      if (proxy) {
        this.proxyManager.reportResult(proxy.id, success);
      }
    };

    return { fetcher, finalize };
  }

  private buildProxyUrl(config: ProxyConfig): string {
    const credentials = config.username
      ? config.password
        ? `${encodeURIComponent(config.username)}:${encodeURIComponent(
            config.password,
          )}@`
        : `${encodeURIComponent(config.username)}@`
      : '';
    return `${config.protocol}://${credentials}${config.host}:${config.port}`;
  }

  private getCookieJar(providerId: ProviderId): CookieJar {
    let cookieJar = this.cookieJars.get(providerId);
    if (!cookieJar) {
      cookieJar = new CookieJar();
      this.cookieJars.set(providerId, cookieJar);
    }
    return cookieJar;
  }
}
