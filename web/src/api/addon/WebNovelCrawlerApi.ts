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
import { CheckCFWall, CheckPixivR18 } from '@/domain/crawler/checker';
import { getAddon } from '.';

const getCrawler = lazy(async () => {
  const addon = await getAddon();

  const client = ky.create({
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      return addon.fetch
        .bind(addon)(input, init)
        .then(async (resp) => {
          await resp.clone().text().then(CheckCFWall);
          return resp;
        });
    },
  });

  const pixivClient = ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      await CheckPixivR18();
      return addon.fetch
        .bind(addon)(input, init)
        .then(async (resp) => {
          await resp.clone().text().then(CheckCFWall);
          return resp;
        });
    },
  });

  const hamelnClient = ky.create({
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      addon
        .cookiesPatch({
          url: 'https://syosetu.org',
          patches: {
            over18: {
              name: 'over18',
              domain: 'syosetu.org',
              value: 'off',
            },
          },
        })
        .then(() =>
          addon
            .tabFetch({ tabUrl: 'https://syosetu.org' }, input, init)
            .then(async (resp) => {
              await resp.clone().text().then(CheckCFWall);
              return resp;
            }),
        ),
  });

  return new WebNovelCrawler({
    alphapolis: () => new Alphapolis(client),
    hameln: () => new Hameln(hamelnClient),
    kakuyomu: () => new Kakuyomu(client),
    novelup: () => new Novelup(client),
    pixiv: () => new Pixiv(pixivClient),
    syosetu: () => new Syosetu(client, { concurrency: 2 }),
  });
});

const getMetadata = async (
  providerId: string,
  novelId: string,
): Promise<WebNovelMetadata | null | undefined> => {
  const crawler = await getCrawler();
  if (!crawler) {
    throw new Error('未检测到浏览器扩展，无法抓取网页小说');
  }
  return crawler.getMetadata(providerId, novelId);
};

export const WebNovelCrawlerApi = {
  getMetadata,
};

export type { WebNovelMetadata };
