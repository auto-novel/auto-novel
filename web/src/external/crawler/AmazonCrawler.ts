import ky from 'ky';

import { AmazonCrawler, extractAsin, prettyCover } from '@auto-novel/crawler';

import { ensureCookie } from '@/external/addon';
import { AddonNotFoundError } from '@/external/errors';
import { lazy } from '@/util';

const getClient = async () => {
  const addon = window.Addon;
  if (!addon) throw new AddonNotFoundError();

  const url = 'https://www.amazon.co.jp';
  const domain = '.amazon.co.jp';
  const keys = ['session-id', 'ubid-acbjp'];

  await ensureCookie(addon, url, domain, keys);

  return ky.create({
    fetch: addon.fetch.bind(addon),
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
