import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';
import type { KyInstance, Options } from 'ky';
import type {
  AmazonProduct,
  AmazonSearchItem,
  AmazonSerial,
} from '@/amazon/types';

import {
  resolveKindleAsin as parseKindleAsin,
  getProduct as parseProduct,
} from '@/amazon/get-product';
import { getSerial as parseSerial } from '@/amazon/get-serial';
import { search as parseSearch } from '@/amazon/search';

const AMAZON_JP_URL = 'https://www.amazon.co.jp';

export class AmazonCrawler {
  constructor(private readonly client: KyInstance) {}

  private async getHtml(url: string, options?: Options): Promise<CheerioAPI> {
    const response = await this.client.get(url, {
      prefixUrl: AMAZON_JP_URL,
      redirect: 'manual',
      credentials: 'include',
      retry: 0,
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
    return cheerio.load(html);
  }

  async getProduct(asin: string): Promise<AmazonProduct> {
    return parseProduct(await this.getHtml(`dp/${asin}`));
  }

  async resolveKindleAsin(asin: string): Promise<string> {
    if (asin.startsWith('B')) return asin;
    return parseKindleAsin(await this.getHtml(`dp/${asin}`), asin);
  }

  async getSerial(asin: string, total: string): Promise<AmazonSerial> {
    return parseSerial(
      await this.getHtml('kindle-dbs/productPage/ajax/seriesAsinList', {
        searchParams: {
          asin,
          pageNumber: 1,
          pageSize: total,
        },
      }),
    );
  }

  async search(query: string): Promise<AmazonSearchItem[]> {
    return parseSearch(
      await this.getHtml('s', {
        searchParams: {
          k: query,
          i: 'stripbooks',
        },
      }),
    );
  }
}
