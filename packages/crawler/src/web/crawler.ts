import ky from 'ky';

import type {
  Page,
  WebNovelChapter,
  WebNovelListItem,
  WebNovelMetadata,
  WebNovelProvider,
} from './types';
import { CrawlerInputError } from '@/errors';

import { Alphapolis } from './alphapolis';
import { Hameln } from './hameln';
import { Kakuyomu } from './kakuyomu';
import { Novelup } from './novelup';
import { Pixiv } from './pixiv';
import { Syosetu } from './syosetu';

type ProviderInitFn = () => WebNovelProvider;

type ProviderId =
  | 'alphapolis'
  | 'hameln'
  | 'kakuyomu'
  | 'novelup'
  | 'pixiv'
  | 'syosetu';

type ProviderRegistry = Partial<Record<ProviderId, ProviderInitFn>>;

export class WebNovelCrawler {
  private readonly providers = new Map<string, ProviderInitFn>();
  private readonly providerInstances = new Map<string, WebNovelProvider>();

  constructor(initialProviders: ProviderRegistry = {}) {
    const defaultProviders: Record<ProviderId, ProviderInitFn> = {
      alphapolis: () => new Alphapolis(ky),
      hameln: () => new Hameln(ky),
      pixiv: () => new Pixiv(ky),
      novelup: () => new Novelup(ky),
      kakuyomu: () => new Kakuyomu(ky),
      syosetu: () => new Syosetu(ky, { concurrency: 2 }),
    };

    for (const [providerId, provider] of Object.entries(defaultProviders)) {
      this.providers.set(providerId, provider);
    }
    for (const [providerId, provider] of Object.entries(initialProviders)) {
      this.providers.set(providerId, provider);
    }
  }

  getProvider(providerId: string): WebNovelProvider {
    const cachedProvider = this.providerInstances.get(providerId);
    if (cachedProvider) {
      return cachedProvider;
    }

    const providerInit = this.providers.get(providerId);
    if (!providerInit) {
      throw new CrawlerInputError(`未知的 providerId：${providerId}`);
    }

    const provider = providerInit();
    this.providerInstances.set(providerId, provider);
    return provider;
  }

  async getRank(
    providerId: string,
    options: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return this.getProvider(providerId).getRank(options);
  }

  async getMetadata(
    providerId: string,
    novelId: string,
  ): Promise<WebNovelMetadata> {
    return this.getProvider(providerId).getMetadata(novelId);
  }

  async getChapter(
    providerId: string,
    novelId: string,
    chapterId: string,
  ): Promise<WebNovelChapter> {
    return this.getProvider(providerId).getChapter(novelId, chapterId);
  }
}
