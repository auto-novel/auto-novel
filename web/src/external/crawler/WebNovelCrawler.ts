import ky from 'ky';

import type { WebNovelChapter, WebNovelMetadata } from '@auto-novel/crawler';
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

let bypassHamelnR18: Promise<void> | undefined;
const ensureBypassR18 = (addon: ReturnType<typeof getAddon>) => {
  if (typeof addon?.cookiesPatch !== 'function') return true;
  bypassHamelnR18 ??= addon
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
    .catch((err) => {
      console.error('Failed to set over18 cookie for Hameln:', err);
      bypassHamelnR18 = undefined;
    });
  return bypassHamelnR18;
};

const getCrawler = lazy(async () => {
  const addon = getAddon();

  const client = ky.create({ fetch: addon.fetch.bind(addon) });

  const hamelnClient = ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      await ensureBypassR18(addon);
      return addon.tabFetch({ tabUrl: 'https://syosetu.org' }, input, init);
    },
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

const getChapter = async (
  providerId: string,
  novelId: string,
  chapterId: string,
): Promise<WebNovelChapter> => {
  const crawler = await getCrawler();
  return crawler.getChapter(providerId, novelId, chapterId);
};

export const WebNovelCrawlerApi = {
  getMetadata,
  getChapter,
};

export type { WebNovelChapter, WebNovelMetadata };
