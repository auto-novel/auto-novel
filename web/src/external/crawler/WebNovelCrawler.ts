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

import { fakeDesktopHeader, mergeHeaders } from './utils';
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
  bypassHamelnR18 ??= addon
    .cookiesPatch({
      url: 'https://h.syosetu.org',
      patches: {
        over18: {
          name: 'over18',
          domain: 'h.syosetu.org',
          value: 'off',
        },
      },
    })
    .catch((err) => {
      console.error('Failed to set over18 cookie for HamelnR18:', err);
      bypassHamelnR18 = undefined;
    });
  return bypassHamelnR18;
};

const getCrawler = lazy(async () => {
  const addon = getAddon();

  const client = ky.create({ fetch: addon.fetch.bind(addon) });

  const hamelnClient = ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const featVersion: string =
        addon.compat?.['tabFetch']?.['redirect'] || '0.0.0';
      const result = compareVersion(addon.version, featVersion);
      if (result == null || result < 0) {
        throw new Error(
          '当前版本的插件不兼容，无法爬取 Hameln，请更新插件到最新版本',
        );
      }

      await ensureBypassR18(addon);
      const headers = mergeHeaders(
        input instanceof Request ? input.headers : {},
        init?.headers,
      );
      fakeDesktopHeader(headers);
      let resp:
        | (Response & { redirected?: boolean; redirectUrls?: string[] })
        | undefined;
      try {
        resp = await addon.tabFetch({ tabUrl: 'https://syosetu.org' }, input, {
          ...init,
          headers,
        });
        if (!resp?.redirected) {
          return resp;
        }
      } catch {
        /* bypass */
      }
      if (!resp) throw new Error('Failed to fetch page for Hameln'); // 一般不会触发

      // 如果触发了重定向，说明可能是 R18 内容，需要访问 h.syosetu.org
      let newUrl = resp?.redirectUrls?.[resp?.redirectUrls.length - 1];
      if (!newUrl) throw new Error('Failed to get redirect URL for Hameln');

      // 有概率原地 tp，从 novel/xxxx => novel/xxxx/
      let baseUrl =
        new URL(newUrl).hostname === 'h.syosetu.org'
          ? 'https://h.syosetu.org'
          : 'https://syosetu.org';
      resp = await addon.tabFetch({ tabUrl: baseUrl }, newUrl, {
        ...init,
        headers,
      });
      return resp;
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

      const headers = mergeHeaders(
        input instanceof Request ? input.headers : {},
        init?.headers,
      );
      fakeDesktopHeader(headers);

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      let resp = await addon.tabFetch(
        { tabUrl: 'https://www.alphapolis.co.jp', forceWaitForLoad: true },
        url,
        { ...init, headers },
      );

      return resp;
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
