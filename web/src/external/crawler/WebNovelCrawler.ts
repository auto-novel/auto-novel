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

import { fakeDesktopHeader, toHeaders } from './utils';
import { compareVersion } from '../errors';

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
      const headers = toHeaders(init?.headers);
      fakeDesktopHeader(headers);
      return addon.tabFetch({ tabUrl: 'https://syosetu.org' }, input, {
        ...init,
        headers,
      });
    },
  });

  const alphapolisClient = ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const featVersion: string =
        addon.compat?.['tab']?.['domQuery']?.['base'] || '0.0.0';
      const result = compareVersion(addon.version, featVersion);
      if (result == null || result < 0) {
        throw new Error(
          '当前版本的插件不兼容，无法爬取 Alphapolis，请更新插件到最新版本',
        );
      }

      const headers = toHeaders(
        input instanceof Request ? input.headers : init?.headers,
      );
      fakeDesktopHeader(headers);

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      let data = await addon.tabDomQuery({
        tabUrl: url,
        selector: 'html',
        options: {
          forceWaitForLoad: true,
          closeTimeout: 5_000,
        },
      });

      if (data.results.length === 0) {
        // 可能是反爬，复用 tab 重新来一次
        data = await addon.tabDomQuery({
          tabUrl: url,
          selector: 'html',
          options: {
            tabId: data?.tabId,
            forceWaitForLoad: true,
            closeTimeout: 5_000,
          },
        });
      }
      const html = data.results?.[0] || '';
      return new Response(html);
    },
  });

  return new WebNovelCrawler({
    alphapolis: () => new Alphapolis(alphapolisClient),
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
