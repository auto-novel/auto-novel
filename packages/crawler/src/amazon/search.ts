import type { AmazonSearchItem } from './types';

import { extractAsin } from './util';

export const search = (doc: Document): AmazonSearchItem[] => {
  const items = Array.from(
    doc.getElementsByClassName('s-search-results')[0].children,
  );
  return items
    .filter((item) => {
      if (!item.getAttribute('data-asin')) {
        return false;
      }

      // 排除漫画
      if (
        Array.from(item.getElementsByTagName('a'))
          .map((el) => el.text)
          .some((text) => text === 'コミック (紙)' || text === 'コミック')
      ) {
        return false;
      }

      return true;
    })
    .map((it) => {
      const asin = it.getAttribute('data-asin')!;
      const title = it.getElementsByTagName('h2')[0].textContent!;
      const cover = it.getElementsByTagName('img')[0].getAttribute('src')!;

      const serialAsin = Array.from(it.getElementsByTagName('a'))
        .filter((it) => {
          const href = it.getAttribute('href')!;
          const child = it.firstElementChild;
          return (
            child &&
            child.tagName === 'SPAN' &&
            child.classList.length === 0 &&
            (href.startsWith('/-/zh/dp/') || href.startsWith('/dp/'))
          );
        })
        .map((it) => extractAsin(it.getAttribute('href')!))
        .find((asin) => asin);
      return { asin, title, cover, serialAsin };
    });
};
