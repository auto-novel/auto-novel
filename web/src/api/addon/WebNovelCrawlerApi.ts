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

import { lazy } from '@/util';

const getCrawler = lazy(async () => {
  const addon = window.Addon;
  if (!addon) return undefined;

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
  if (!window.Addon || !crawler) {
    throw new Error('未检测到浏览器扩展，无法抓取网页小说');
  }
  return crawler.getMetadata(providerId, novelId);
};

export const WebNovelCrawlerApi = {
  getMetadata,
};

export type { WebNovelMetadata };
