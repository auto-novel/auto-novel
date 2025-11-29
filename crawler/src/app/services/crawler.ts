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
import { Providers, ProviderId } from '@/index';
import { ProxyConfig, ProxyManager, type ProxyState } from './proxy';

type Fetcher = Options['fetch'];
type ProviderHandler<T> = (provider: WebNovelProvider) => Promise<T>;

export class CrawlerService {
  private readonly proxyManager: ProxyManager;
  private readonly impitDefaults: Partial<ImpitOptions>;

  constructor(options: { proxyManager: ProxyManager }) {
    this.proxyManager = options.proxyManager;
    this.impitDefaults = {
      timeout: 30_000,
      browser: 'chrome',
      followRedirects: true,
    };
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
    const { fetcher, finalize } = this.buildFetcher(proxy);
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

  private buildFetcher(proxy: ProxyState | null) {
    const client = new Impit({
      ...this.impitDefaults,
      proxyUrl: proxy ? this.buildProxyUrl(proxy.config) : undefined,
    });

    const fetcher: Fetcher = async (input, init) => {
      const requestInit: ImpitRequestInit | undefined = init
        ? ({
            ...init,
            method: init.method ? (init.method as HttpMethod) : undefined,
            body: init.body === null ? undefined : init.body,
          } as ImpitRequestInit)
        : undefined;
      const response = await client.fetch(input, requestInit);
      if (!response.ok) {
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
