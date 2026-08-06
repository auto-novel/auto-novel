import type { CheerioAPI } from 'cheerio';
import type { AmazonSerial } from './types';

import { extractAsin } from './util';

export const getSerial = ($: CheerioAPI): AmazonSerial => {
  const authorsSet = new Set<string>();
  const artistsSet = new Set<string>();
  $('[data-action="a-popover"]').each((_, element) => {
    ($(element).attr('data-a-popover') ?? '')
      .split('\\n')
      .map((it) => it.trim())
      .forEach((contribution) => {
        if (contribution.endsWith('(著)')) {
          authorsSet.add(contribution.replace(/(\(著\))$/, '').trim());
        } else if (contribution.endsWith('(イラスト)')) {
          artistsSet.add(contribution.replace(/(\(イラスト\))$/, '').trim());
        }
      });
  });
  $('.series-childAsin-item-details-contributor').each((_, element) => {
    const contribution = $(element).text().trim().replace(/(,)$/, '').trim();
    if (contribution.endsWith('(著)')) {
      authorsSet.add(contribution.replace(/(\(著\))$/, '').trim());
    } else if (contribution.endsWith('(イラスト)')) {
      artistsSet.add(contribution.replace(/(\(イラスト\))$/, '').trim());
    }
  });

  const authors = [...authorsSet].filter((it) => !artistsSet.has(it));
  const artists = [...artistsSet];

  const volumes = $('#series-childAsin-batch_1')
    .children()
    .toArray()
    .map((element) => {
      const item = $(element);
      const titleLink = item
        .find('.a-size-base-plus.a-link-normal.itemBookTitle.a-text-bold')
        .first();
      const asin = extractAsin(titleLink.attr('href') ?? '')!;
      const title = titleLink.text();
      const cover = item.find('img').first().attr('src')!;
      return { asin, title, cover };
    });

  return { authors, artists, volumes };
};
