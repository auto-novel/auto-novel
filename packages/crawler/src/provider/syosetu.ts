import type { CheerioAPI } from 'cheerio';
import * as cheerio from 'cheerio';
import type { KyInstance } from 'ky';

import { parseJapanDateString } from '@/utils';

import {
  type Page,
  type RemoteChapter,
  type RemoteNovelListItem,
  type RemoteNovelMetadata,
  type TocItem,
  type WebNovelAuthor,
  type WebNovelProvider,
  WebNovelAttention,
  WebNovelType,
  emptyPage,
} from './types';

const RANGE_IDS = {
  每日: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  季度: 'quarter',
  每年: 'yearly',
  总计: 'total',
} as const;

const STATUS_IDS = {
  全部: 'total',
  短篇: 't',
  连载: 'r',
  完结: 'er',
} as const;

const GENRE_IDS_V1 = {
  '恋爱：异世界': '101',
  '恋爱：现实世界': '102',
  '幻想：高幻想': '201',
  '幻想：低幻想': '202',
  '文学：纯文学': '301',
  '文学：人性剧': '302',
  '文学：历史': '303',
  '文学：推理': '304',
  '文学：恐怖': '305',
  '文学：动作': '306',
  '文学：喜剧': '307',
  '科幻：VR游戏': '401',
  '科幻：宇宙': '402',
  '科幻：空想科学': '403',
  '科幻：惊悚': '404',
  '其他：童话': '9901',
  '其他：诗': '9902',
  '其他：散文': '9903',
  '其他：其他': '9999',
} as const;

const GENRE_IDS_V2 = {
  恋爱: '1',
  幻想: '2',
  '文学/科幻/其他': 'o',
} as const;

type GetRankOptions = {
  range: keyof typeof RANGE_IDS;
  status: keyof typeof STATUS_IDS;
  page: string;
} & (
  | {
      type: '流派';
      genre: keyof typeof GENRE_IDS_V1;
    }
  | { type: '综合' }
  | {
      type: '异世界转生/转移';
      genre: keyof typeof GENRE_IDS_V2;
    }
);

function parseAttention(tag: string): WebNovelAttention | undefined {
  switch (tag.trim()) {
    case 'R15':
    case 'R-15':
      return WebNovelAttention.R15;
    case 'R18':
    case 'R-18':
      return WebNovelAttention.R18;
    case '残酷描写有り':
    case '残酷描写あり':
    case '残酷な描写':
    case '残酷な描写あり':
      return WebNovelAttention.Cruelty;
    case '暴力描写有り':
    case '暴力描写あり':
      return WebNovelAttention.Violence;
    case '性描写有り':
    case '性的表現あり':
      return WebNovelAttention.SexualContent;
    default:
      return undefined;
  }
}

function parseWebNovelType(typeText: string): WebNovelType {
  switch (typeText) {
    case '完結済':
      return WebNovelType.Completed;
    case '連載中':
      return WebNovelType.Ongoing;
    case '短編':
      return WebNovelType.ShortStory;
    default:
      throw new Error(`无法解析的小说类型: ${typeText}`);
  }
}

function hrefLastSegment(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const normalized = href.endsWith('/') ? href.slice(0, -1) : href;
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export class Syosetu implements WebNovelProvider<GetRankOptions> {
  readonly id = 'syosetu';
  readonly version = '2.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(options: GetRankOptions): Promise<Page<RemoteNovelListItem>> {
    const rangeId = RANGE_IDS[options['range']];
    if (!rangeId) return emptyPage();

    const statusId = STATUS_IDS[options['status']];
    if (!statusId) return emptyPage();

    let path = '';
    switch (options['type']) {
      case '流派': {
        const genreId = GENRE_IDS_V1[options['genre']];
        if (!genreId) return emptyPage();
        path = `genrelist/type/${rangeId}_${genreId}_${statusId}`;
        break;
      }
      case '综合':
        path = `list/type/${rangeId}_${statusId}`;
        break;
      case '异世界转生/转移': {
        const genreId = GENRE_IDS_V2[options['genre']];
        if (!genreId) return emptyPage();
        path = `isekailist/type/${rangeId}_${genreId}_${statusId}`;
        break;
      }
      default:
        break;
    }
    if (!path) return emptyPage();

    const page = Number(options['page']);
    if (!Number.isFinite(page) || page < 1) return emptyPage();

    const $ = await this.client
      .get(`https://yomou.syosetu.com/rank/${path}/?p=${page}`)
      .text()
      .then((text) => cheerio.load(text));

    const maxPage = Math.max(0, $('.c-pager').first().children().length - 2);
    const items = $('.p-ranklist-item')
      .map((_, item) => {
        const root = $(item);
        const titleLink = root.find('div.p-ranklist-item__title > a').first();

        const attentions: WebNovelAttention[] = [];
        const keywords: string[] = [];
        root
          .find('div.p-ranklist-item__keyword')
          .first()
          .find('a')
          .each((_, tagEl) => {
            const tag = $(tagEl).text().trim();
            const attention = parseAttention(tag);
            if (attention) {
              attentions.push(attention);
            } else if (tag) {
              keywords.push(tag);
            }
          });

        const extra = [
          ...root.find('div.p-ranklist-item__points').toArray(),
          ...root
            .find('div.p-ranklist-item__infomation .p-ranklist-item__separator')
            .toArray(),
        ]
          .map((el) => $(el).text().trim())
          .filter(Boolean)
          .join(' / ');

        return {
          novelId: hrefLastSegment(titleLink.attr('href')) ?? '',
          title: titleLink.text().trim(),
          attentions,
          keywords,
          extra,
        } satisfies RemoteNovelListItem;
      })
      .get()
      .filter((item) => item.novelId && item.title);

    return {
      items,
      pageNumber: maxPage,
    };
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const [$, $info] = await Promise.all([
      this.client
        .get(`https://ncode.syosetu.com/${novelId}`)
        .text()

        .then((text) => cheerio.load(text)),
      this.client
        .get(`https://ncode.syosetu.com/novelview/infotop/ncode/${novelId}`)
        .text()
        .then((text) => cheerio.load(text)),
    ]);

    const title = $info('h1').first().text().trim();
    if (!title) throw new Error('标题解析失败');

    const infoData = $info('.p-infotop-data').first();
    const infoType = $info('.p-infotop-type').first();
    if (infoData.length === 0 || infoType.length === 0)
      throw new Error('作品信息解析失败');

    const row = (label: string) =>
      infoData
        .find('dt')
        .filter((_, el) => $info(el).text().trim() === label)
        .first()
        .next();

    const authorCell = row('作者名');
    const authorName = authorCell.text().trim();
    if (!authorName) throw new Error('作者解析失败');
    const authorLink = authorCell.find('a').attr('href');
    const authors: WebNovelAuthor[] = [{ name: authorName, link: authorLink }];

    const typeText = infoType
      .find('.p-infotop-type__type')
      .first()
      .text()
      .trim();
    if (!typeText) throw new Error('小说类型解析失败');
    const type = parseWebNovelType(typeText);

    const attentionSet = new Set<WebNovelAttention>();
    const keywords: string[] = [];

    const keywordTags = row('キーワード')
      .text()
      .trim()
      .split(/[\s\u00A0]+/)
      .map((it) => it.trim())
      .filter(Boolean);
    for (const tag of keywordTags) {
      const attention = parseAttention(tag);
      if (attention) {
        attentionSet.add(attention);
      } else {
        keywords.push(tag);
      }
    }

    const r18Text = infoType.find('.p-infotop-type__r18').first().text().trim();
    if (r18Text) {
      if (r18Text === 'R18') {
        attentionSet.add(WebNovelAttention.R18);
      } else {
        throw new Error(`无法解析的注意事项: ${r18Text}`);
      }
    }

    function extractNumber(text: string): number | undefined {
      const digits = text.replace(/[^0-9]/g, '');
      if (digits.length === 0) return undefined;
      const value = Number(digits);
      return Number.isFinite(value) ? value : undefined;
    }

    const points = extractNumber(row('総合評価').text());

    const totalCharacters = extractNumber(row('文字数').text());
    if (!totalCharacters) throw new Error('字数解析失败');

    const introduction = row('あらすじ').text().trim();
    if (!introduction) throw new Error('简介解析失败');

    let toc: TocItem[];
    if ($('div.p-eplist').first().length === 0) {
      toc = [
        {
          title: '无名',
          chapterId: 'default',
          createAt: undefined,
        },
      ];
    } else {
      const lastPageHref = $('.c-pager__item--last').first().attr('href');
      const totalPages = Number(lastPageHref?.split('/?p=')[1] ?? '1') || 1;

      function parseTocPage($: CheerioAPI): TocItem[] {
        return $('div.p-eplist')
          .first()
          .children()
          .map((_, element) => {
            const item = $(element);
            const link = item.find('a').first();

            if (link.length === 0) {
              return {
                title: item.text().trim(),
                chapterId: undefined,
                createAt: undefined,
              } satisfies TocItem;
            }

            const createAtText = item
              .find('div.p-eplist__update')
              .contents()
              .filter((_, node) => node.type === 'text')
              .first()
              .text()
              .trim();
            const createAt = parseJapanDateString(
              'yyyy/MM/dd HH:mm',
              createAtText,
            )?.toISOString();

            return {
              title: link.text().trim(),
              chapterId: hrefLastSegment(link.attr('href')),
              createAt,
            } satisfies TocItem;
          })
          .get();
      }

      toc = parseTocPage($);
      for (let page = 2; page <= totalPages; page += 1) {
        const $page = await this.client
          .get(`https://ncode.syosetu.com/${novelId}/?p=${page}`)
          .text()
          .then((text) => cheerio.load(text));
        toc.push(...parseTocPage($page));
      }
    }

    return {
      title,
      authors,
      type,
      attentions: Array.from(attentionSet),
      keywords,
      points,
      totalCharacters,
      introduction,
      toc,
    };
  }

  async getChapter(
    novelId: string,
    chapterId: string,
  ): Promise<RemoteChapter | null> {
    const url =
      chapterId === 'default'
        ? `https://ncode.syosetu.com/${novelId}`
        : `https://ncode.syosetu.com/${novelId}/${chapterId}`;

    const $ = await this.client
      .get(url)
      .text()
      .then((text) => cheerio.load(text));

    $('rp, rt').remove();
    $('br').replaceWith('\n');

    const paragraphs = $('div.p-novel__body > div > p')
      .map((_, paragraph) => {
        const p = $(paragraph);
        const image = p.children().first().children().first();
        if (image.length > 0 && image.is('img')) {
          return `<图片>https:${image.attr('src') ?? ''}`;
        }
        return p.text();
      })
      .get();

    return { paragraphs };
  }
}
