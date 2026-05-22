import ky from 'ky';

import { AmazonCrawler, extractAsin, prettyCover } from '@auto-novel/crawler';

import { ensureCookie, getAddon, toHeaderDict } from '@/external/addon';
import { lazy } from '@/util';

const getClient = async () => {
  const addon = getAddon();

  const url = 'https://www.amazon.co.jp';
  const domain = '.amazon.co.jp';
  const keys = ['session-id', 'ubid-acbjp'];

  await ensureCookie(addon, url, domain, keys);

  return ky.create({
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const headers = toHeaderDict(init?.headers);
      headers['accept-language'] =
        'en-US, en;q=0.9, ja;q=0.8, zh-CN;q=0.7, zh;q=0.6, zh-TW;q=0.5, fr;q=0.4, pt;q=0.3';
      return addon.fetch(input, { ...init, headers });
    },
  });
};

const getAmazonCrawler = lazy(async () => new AmazonCrawler(await getClient()));

const getProduct = async (asin: string) =>
  (await getAmazonCrawler()).getProduct(asin);

const resolveKindleAsin = async (asin: string) =>
  (await getAmazonCrawler()).resolveKindleAsin(asin);

const getSerial = async (asin: string, total: string) =>
  (await getAmazonCrawler()).getSerial(asin, total);

const search = async (query: string) =>
  (await getAmazonCrawler()).search(query);

export const AmazonCrawlerApi = {
  extractAsin,
  prettyCover,
  getProduct,
  resolveKindleAsin,
  getSerial,
  search,
};
