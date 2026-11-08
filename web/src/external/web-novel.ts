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

import { AddonApi, getAddon } from '@/external/addon';
import { checkIsMobile, lazy } from '@/util';

import { compareVersion } from './addon-errors';

function getFakeDesktopUA(): string {
  const ua = navigator.userAgent;

  const appleWebKitVersion =
    ua.match(/\bAppleWebKit\/([\d.]+)/i)?.[1] ?? '537.36';
  const safariVersion =
    ua.match(/\bSafari\/([\d.]+)/i)?.[1] ?? appleWebKitVersion;
  const chromiumLike = (version: string) =>
    `AppleWebKit/${appleWebKitVersion} (KHTML, like Gecko) Chrome/${version} Safari/${safariVersion}`;

  const edge = ua.match(/\b(?:EdgA|EdgiOS)\/([\d.]+)/i);
  if (edge !== null) {
    const chrome = ua.match(/\b(?:Chrome|CriOS)\/([\d.]+)/i);
    const chromiumVersion = chrome?.[1] ?? edge[1];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chromiumLike(chromiumVersion)} Edg/${edge[1]}`;
  }

  const chrome = ua.match(/\b(?:Chrome|CriOS)\/([\d.]+)/i);
  if (chrome !== null) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chromiumLike(chrome[1])}`;
  }

  const firefox = ua.match(/\b(?:Firefox|FxiOS)\/([\d.]+)/i);
  if (firefox !== null) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${firefox[1]}) Gecko/20100101 Firefox/${firefox[1]}`;
  }

  return ua
    .replace(
      /\([^)]*(?:Android|iPhone|iPad|iPod)[^)]*\)/i,
      '(Windows NT 10.0; Win64; x64)',
    )
    .replace(/\sMobile(?:\/\w+)?(?=\s|$)/i, '')
    .replace(/\bCriOS\//i, 'Chrome/')
    .replace(/\bEdgA\//i, 'Edg/')
    .replace(/\bEdgiOS\//i, 'Edg/')
    .replace(/\bFxiOS\//i, 'Firefox/');
}

function mergeHeaders(
  headersA?: HeadersInit,
  headersB?: HeadersInit,
): Record<string, string> {
  const headerDict: Record<string, string> = {};
  new Headers(headersA).forEach((value, key) => {
    headerDict[key] = value;
  });
  new Headers(headersB).forEach((value, key) => {
    headerDict[key] = value;
  });
  return headerDict;
}

function fakeDesktopHeader(headers: Record<string, string>): void {
  if (checkIsMobile()) {
    headers['User-Agent'] = getFakeDesktopUA();
    headers['Viewport-Width'] = '2560';
  }
}

let bypassHamelnR18: Promise<void> | undefined;
const ensureBypassR18 = (addon: AddonApi) => {
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

const getLastRedirectUrl = (source: unknown): string | undefined => {
  if (typeof source !== 'object' || source === null) return undefined;

  if ('redirectUrls' in source && Array.isArray(source.redirectUrls)) {
    const url = source.redirectUrls[source.redirectUrls.length - 1];
    if (typeof url === 'string') return url;
  }

  if ('redirectUrl' in source && typeof source.redirectUrl === 'string') {
    return source.redirectUrl;
  }

  return undefined;
};

const getCrawler = lazy(async () => {
  const addon = await getAddon();

  const client = ky.create({ fetch: addon.fetch.bind(addon) });

  const hamelnClient = ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const featVersion: string = addon.compat?.['tabFetch']?.['redirect'];
      const result = featVersion
        ? compareVersion(addon.version, featVersion)
        : null;
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

      let reqUrl = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      for (let i = 0; i < 5; i++) {
        // SAFE(kuriko): 假定 Hameln 不会对用户发起重定向攻击 LOL
        const baseUrl = reqUrl.origin;

        try {
          const resp = await addon.tabFetch({ tabUrl: baseUrl }, reqUrl, {
            ...init,
            headers,
          });
          if (!resp.redirected) {
            return resp;
          }

          const redirectUrl = getLastRedirectUrl(resp);
          if (!redirectUrl) {
            throw new Error('Failed to get redirect URL for Hameln');
          }
          reqUrl = new URL(redirectUrl);
        } catch (error) {
          const redirectUrl = getLastRedirectUrl(error);
          if (!redirectUrl) throw error;
          reqUrl = new URL(redirectUrl);
        }
      }
      throw new Error('Too many redirects for Hameln');
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
