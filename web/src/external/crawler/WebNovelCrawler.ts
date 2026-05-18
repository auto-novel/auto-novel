import ky from 'ky';

import type { WebNovelMetadata } from '@auto-novel/crawler';
import {
  Alphapolis,
  Hameln,
  Kakuyomu,
  Novelup,
  Pixiv,
  Syosetu,
  WebNovelCrawler,
} from '@auto-novel/crawler';

import { getAddon } from '@/external/addon';
import { lazy } from '@/util';

const getCrawler = lazy(async () => {
  const addon = getAddon();

  const client = ky.create({ fetch: addon.fetch.bind(addon) });
  const hamelnClient = ky.create({
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      addon.tabFetch({ tabUrl: 'https://syosetu.org' }, input, init),
  });

  return new WebNovelCrawler({
    alphapolis: () => new Alphapolis(client),
    hameln: () => new Hameln(hamelnClient),
    kakuyomu: () => new Kakuyomu(client),
    novelup: () => new Novelup(client),
    pixiv: () => new Pixiv(client),
    syosetu: () => new Syosetu(client, { concurrency: 2 }),
  });
});

const getMetadata = async (
  providerId: string,
  novelId: string,
): Promise<WebNovelMetadata> => {
  const crawler = await getCrawler();
  return crawler.getMetadata(providerId, novelId);
};

export const WebNovelCrawlerApi = {
  getMetadata,
};

export type { WebNovelMetadata };
