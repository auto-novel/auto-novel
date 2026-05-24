import type { CheerioAPI } from 'cheerio';
import type { AmazonSearchItem } from './types';

import { extractAsin } from './util';

export const search = ($: CheerioAPI): AmazonSearchItem[] => {
  const items = $('.s-search-results').first().children().toArray();
  return items
    .filter((item) => {
      const asin = $(item).attr('data-asin');
      if (!asin) {
        return false;
      }

      // 排除漫画
      const isComic = $(item)
        .find('a')
        .toArray()
        .map((element) => $(element).text())
        .some((text) => text === 'コミック (紙)' || text === 'コミック');
      if (isComic) {
        return false;
      }

      return true;
    })
    .map((it) => {
      const item = $(it);
      const asin = item.attr('data-asin')!;
      const title = item.find('h2').first().text();
      const cover = item.find('img').first().attr('src')!;

      const serialAsin = item
        .find('a')
        .toArray()
        .filter((element) => {
          const href = $(element).attr('href') ?? '';
          const child = $(element).children().first();
          return (
            child.length > 0 &&
            child.get(0)?.tagName === 'span' &&
            (child.attr('class')?.trim() ?? '') === '' &&
            (href.startsWith('/-/zh/dp/') || href.startsWith('/dp/'))
          );
        })
        .map((element) => extractAsin($(element).attr('href') ?? ''))
        .find((asin) => asin);
      return { asin, title, cover, serialAsin };
    });
};
