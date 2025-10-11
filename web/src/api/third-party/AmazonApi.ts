import ky from 'ky';
import type { Options } from 'ky';

import { Addon } from '@/util/useAddon';

const getHtml = async (url: string, options?: Options) => {
  const response = await ky.get(url, {
    prefixUrl: 'https://www.amazon.co.jp',
    redirect: 'manual',
    credentials: 'include',
    retry: 0,
    fetch: Addon.fetch,
    // fetch: Addon.tabFetch.bind(Addon, 'https://www.amazon.co.jp/'),
    // fetch: Addon.spoofFetch.bind(Addon, 'https://www.amazon.co.jp/'),
    ...options,
  });

  if (response.status === 404) {
    throw Error('小说不存在，请删除cookie并使用日本IP重试');
  } else if (response.status === 0) {
    throw Error('触发年龄限制，请按说明使用插件');
  } else if (!response.ok) {
    throw Error(`未知错误，${response.status}`);
  }
  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc;
};

const getProduct = (asin: string) => getHtml(`dp/${asin}`);

const getSerial = (asin: string, total: string) =>
  getHtml('kindle-dbs/productPage/ajax/seriesAsinList', {
    searchParams: {
      asin,
      pageNumber: 1,
      pageSize: total,
    },
  });

const search = (query: string) =>
  getHtml('s', {
    searchParams: {
      k: query,
      i: 'stripbooks',
    },
  });

export const createAmazonRepository = () => {
  return {
    getProduct,
    getSerial,
    search,
  };
};

export const AmazonApi = {
  getProduct,
  getSerial,
  search,
};
