import {
  Impit,
  type HttpMethod,
  type ImpitOptions,
  type RequestInit as ImpitRequestInit,
} from 'impit';
import ky, { type Options } from 'ky';

import type {
  Page,
  RemoteChapter,
  RemoteNovelListItem,
  RemoteNovelMetadata,
  WebNovelProvider,
} from '@/domain/types';
import { Providers, ProviderId, PROVIDER_IDS } from '@/index';
import { ProxyConfig, ProxyManager, type ProxyState } from './proxy';
import z from 'zod';
import { CookieJar } from 'tough-cookie';
import { forEach } from 'lodash-es';

type Fetcher = Options['fetch'];
type ProviderHandler<T> = (provider: WebNovelProvider) => Promise<T>;

// Record<ProviderId, Record<headerName, headerValue>>
export const HeaderSchema = z.record(z.string(), z.string());
export type HeaderArray = z.infer<typeof HeaderSchema>;

export const HeadersByProviderConfigSchema = z.partialRecord(
  z.enum(PROVIDER_IDS),
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
  private readonly cookieJar = new Map<ProviderId, CookieJar>();

  constructor(options: CrawlerServiceOptions) {
    this.proxyManager = options.proxyManager;
    this.impitDefaults = {
      timeout: 30_000,
      browser: 'chrome',
      followRedirects: true,
    };

    const defaultHeaders = options?.headers?.['default'] ?? {};
    forEach(options.headers, (headers, providerId) => {
      if (providerId == 'default') {
        return;
      }
      const finalHeader = {
        ...defaultHeaders,
        ...(headers ?? {}),
      };
      console.debug('Setting initial headers for provider:', providerId);
      console.debug(finalHeader);
      this.headers.set(providerId as ProviderId, finalHeader);
    });
  }

  async getMetadata(
    providerId: ProviderId,
    novelId: string,
  ): Promise<RemoteNovelMetadata | null> {
    return this.fetchResource(providerId, (provider) =>
      provider.getMetadata(novelId),
    );
  }

  async getRank(
    providerId: ProviderId,
    params: Record<string, string>,
  ): Promise<Page<RemoteNovelListItem> | null> {
    return this.fetchResource(providerId, (provider) =>
      provider.getRank(params),
    );
  }

  async getChapter(
    providerId: ProviderId,
    novelId: string,
    chapterId: string,
  ): Promise<RemoteChapter | null> {
    return this.fetchResource(providerId, (provider) =>
      provider.getChapter(novelId, chapterId),
    );
  }

  private async fetchResource<T>(
    providerId: ProviderId,
    handler: ProviderHandler<T>,
  ): Promise<T> {
    const providerInit = this.requireProvider(providerId);
    const proxy = this.proxyManager.pick();
    const { fetcher, finalize } = this.buildFetcher(providerId, proxy);
    const client = ky.create({ fetch: fetcher });
    const provider = providerInit(client);

    try {
      const result = await handler(provider);
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
    const cookieJar = this.cookieJar.get(providerId);

    const client = new Impit({
      proxyUrl,
      cookieJar,
      headers: {
        ...(this.impitDefaults.headers ?? {}),
        ...(headers ?? {}),
      },
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
      if (!response.ok) {
        console.debug('response:', await response.text());
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`,
        );
      }
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

  private requireProvider(providerId: ProviderId) {
    const providerInit = Providers[providerId];
    if (!providerInit) {
      throw new Error(`Unknown providerId: ${providerId}`);
    }
    return providerInit;
  }
}
