import type { CheerioAPI } from 'cheerio';
import type {
  AmazonProduct,
  AmazonProductSerial,
  AmazonProductSet,
  AmazonProductVolume,
} from './types';

import { extractAsin } from './util';

const parseAuthor = ($: CheerioAPI) => {
  const authors: string[] = [];
  const artists: string[] = [];
  $('.author').each((_, element) => {
    const contribution =
      $(element)
        .find('.contribution')
        .first()
        .text()
        .trim()
        .replace(/,$/, '') ?? '';
    const name = $(element).find('a').first().text().trim();
    if (contribution.endsWith('(著)') || contribution.endsWith('(作者)')) {
      authors.push(name);
    } else if (
      contribution.endsWith('(イラスト)') ||
      contribution.endsWith('(插图作者)')
    ) {
      artists.push(name);
    }
  });
  return { authors, artists };
};

export const getProduct = ($: CheerioAPI): AmazonProduct => {
  if ($('.series-childAsin-widget').length > 0) {
    return {
      type: 'serial' as const,
      serial: parseProductSerial($),
    };
  } else if ($('.bundle-components').length > 0) {
    return {
      type: 'set' as const,
      set: parseProductSet($),
    };
  } else {
    return {
      type: 'volume' as const,
      volume: parseProductVolume($),
    };
  }
};

const parseProductSerial = ($: CheerioAPI): AmazonProductSerial => {
  const title = $('#collection-title').text().trim() || undefined;

  const total = $('#collection-size').text().match(/\d+/)?.[0] ?? '100';
  return { title, total };
};

const parseProductSet = ($: CheerioAPI): AmazonProductSet => {
  const title = $('#productTitle').text().trim();
  const { authors, artists } = parseAuthor($);
  const volumes = $('.bundle-components')
    .first()
    .children()
    .toArray()
    .map((element) => {
      const container = $(element);
      const img = container.children().first().find('img').first();
      const link = container
        .children()
        .eq(1)
        .children()
        .first()
        .find('a')
        .first();

      const asin = extractAsin(link.attr('href') ?? '')!;
      const title = link.text();
      const cover = img.attr('src')!;
      return { asin, title, cover };
    });
  return {
    title,
    authors,
    artists,
    volumes,
  };
};

const parseProductVolume = ($: CheerioAPI): AmazonProductVolume => {
  const title = $('#productTitle').text().trim();
  if (!title) throw new Error('解析错误：未找到标题');

  const subtitle = $('#productSubtitle').text();
  const r18 = subtitle.includes('成人') || subtitle.includes('アダルト');

  const { authors, artists } = parseAuthor($);

  const introduction = $('#bookDescription_feature_div')
    .find('span:not(.a-expander-prompt)')
    .toArray()
    .map((element) => $(element).html()?.replaceAll('<br>', '\n') ?? '')
    .join('\n');

  const cover = $('#landingImage').attr('src');
  if (!cover) throw new Error('解析错误：未找到封面');

  const coverHires =
    $('img[data-old-hires]').first().attr('data-old-hires') ?? '';
  if (!coverHires) console.warn('解析错误：未找到高分辨率封面');

  const getCarouselElement = (label: string) => {
    const labelNode = $('span')
      .toArray()
      .find((element) => $(element).text().trim() === label);
    if (!labelNode) return undefined;
    return $(labelNode).parent().next().next().text() || undefined;
  };

  const getPublisher = () => getCarouselElement('出版社') ?? undefined;

  const getPublishAt = () => {
    const dateStr =
      getCarouselElement('出版日期') ?? getCarouselElement('発売日');
    if (!dateStr) return;

    const regex1 = /(\d+)年 (\d+)月 (\d+)日/; // 2018年 6月 9日
    const regex2 = /(\d+)\/(\d+)\/(\d+)/; // 2018/6/9

    const match = dateStr.match(regex1) ?? dateStr.match(regex2);
    if (match) {
      const [, yearStr, monthStr, dayStr] = match;
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // JavaScript月份从0开始
      const day = parseInt(dayStr, 10);
      const date = new Date(year, month, day);
      return date.getTime() / 1000;
    }
    return;
  };

  const publisher = getPublisher()?.trim();
  const publishAt = getPublishAt();

  const breadcrumbs =
    $('#wayfinding-breadcrumbs_container').text().split('›').pop()?.trim() ??
    '';

  const otherVersion = $('#tmmSwatches .slot-title')
    .toArray()
    .map((element) => $(element).text().trim());

  return {
    title,
    cover,
    coverHires,
    authors,
    artists,
    introduction,
    publisher,
    publishAt,
    r18,
    breadcrumbs,
    otherVersion,
  };
};

export const resolveKindleAsin = (
  $: CheerioAPI,
  fallbackAsin: string,
): string => {
  const kindleLink = $('#tmm-grid-swatch-KINDLE a').first();
  if (kindleLink.length > 0) {
    const kindleAsin = extractAsin(kindleLink.attr('href') ?? '');
    if (kindleAsin) return kindleAsin;
  }
  return fallbackAsin;
};
