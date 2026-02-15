import { AmazonApi } from '@/api';
import { extractAsin } from './Common';

const parseAuthor = (elements: HTMLCollectionOf<Element>) => {
  const authors: string[] = [];
  const artists: string[] = [];
  Array.from(elements).forEach((element) => {
    const contribution =
      element
        .getElementsByClassName('contribution')
        .item(0)
        ?.textContent?.trim()
        ?.replace(/,$/, '') ?? '';
    const name =
      element.getElementsByTagName('a').item(0)?.textContent?.trim() ?? '';
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

const parseProduct = (doc: Document) => {
  if (doc.getElementsByClassName('series-childAsin-widget').item(0) !== null) {
    return {
      type: 'serial' as const,
      serial: parseProductSerial(doc),
    };
  } else if (doc.getElementsByClassName('bundle-components').item(0) !== null) {
    return {
      type: 'set' as const,
      set: parseProductSet(doc),
    };
  } else {
    return {
      type: 'volume' as const,
      volume: parseProductVolume(doc),
    };
  }
};

const parseProductSerial = (doc: Document) => {
  const title = doc.getElementById('collection-title')?.textContent?.trim();

  const total =
    doc.getElementById('collection-size')?.textContent?.match(/\d+/)?.[0] ??
    '100';
  return { title, total };
};

const parseProductSet = (doc: Document) => {
  const title = doc.getElementById('productTitle')!.textContent!;
  const { authors, artists } = parseAuthor(
    doc.getElementsByClassName('author'),
  );
  const volumes = Array.from(
    doc.getElementsByClassName('bundle-components')[0].children,
  ).map((el) => {
    const img = el.children[0].getElementsByTagName('img')[0];
    const a = el.children[1].children[0].getElementsByTagName('a')[0];

    const asin = extractAsin(a.getAttribute('href')!)!;
    const title = a.text;
    const cover = img.getAttribute('src')!;
    return { asin, title, cover };
  });
  return {
    title,
    authors,
    artists,
    volumes,
  };
};

const parseProductVolume = (doc: Document) => {
  const title = doc.getElementById('productTitle')!.textContent!;
  const subtitle = doc.getElementById('productSubtitle')?.textContent ?? '';
  const r18 = subtitle.includes('成人') || subtitle.includes('アダルト');

  const { authors, artists } = parseAuthor(
    doc.getElementsByClassName('author'),
  );

  const introduction = Array.from(
    doc
      .getElementById('bookDescription_feature_div')
      ?.querySelectorAll('span:not(.a-expander-prompt)') ?? [],
  )
    .map((el) => el.innerHTML.replaceAll('<br>', '\n'))
    .join('\n');

  const cover = doc.getElementById('landingImage')!.getAttribute('src')!;

  const coverHires = doc
    .querySelector('img[data-old-hires]')!
    .getAttribute('data-old-hires')!;

  const getElementContain = (tag: string, content: string) => {
    return doc.evaluate(
      `//${tag}[text()='${content}']`,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
  };

  const getCarouselElement = (label: string) =>
    getElementContain('span', label)?.parentElement?.nextElementSibling
      ?.nextElementSibling?.textContent;

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
    doc
      .getElementById('wayfinding-breadcrumbs_container')
      ?.textContent?.split('›')
      ?.pop()
      ?.trim() ?? '';

  const otherVersion = Array.from(
    doc.getElementById('tmmSwatches')?.getElementsByClassName('slot-title') ??
      [],
  ).map((el) => el.textContent?.trim() ?? '');

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

export const resolveKindleAsin = async (isbn: string): Promise<string> => {
  const doc = await AmazonApi.getProduct(isbn);
  const kindleLink = doc
    .getElementById('tmm-grid-swatch-KINDLE')
    ?.querySelector('a');
  if (kindleLink) {
    const kindleAsin = extractAsin(kindleLink.getAttribute('href')!);
    if (kindleAsin) return kindleAsin;
  }
  return isbn;
};

export const getProduct = (asin: string) =>
  AmazonApi.getProduct(asin).then(parseProduct);
