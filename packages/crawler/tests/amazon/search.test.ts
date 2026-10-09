import * as cheerio from 'cheerio';
import { describe, expect, test } from 'vitest';

import { search } from '@/amazon/search';

describe('amazon search', () => {
  test('removes duplicate asins', () => {
    const item = (asin: string) =>
      `<div data-asin="${asin}"><h2>title ${asin}</h2><img src="cover.jpg"></div>`;
    const $ = cheerio.load(
      `<div class="s-search-results">${item('B0CDWDZQ2M')}${item('B0CDWDZQ2M')}${item('B000000001')}</div>`,
    );
    expect(search($).map((it) => it.asin)).toEqual([
      'B0CDWDZQ2M',
      'B000000001',
    ]);
  });
});
