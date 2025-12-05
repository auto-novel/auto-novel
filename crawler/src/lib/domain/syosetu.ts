import * as cheerio from 'cheerio';
import {
  type TocItem,
  WebNovelAttention,
  type Page,
  type RemoteChapter,
  type RemoteNovelListItem,
  type RemoteNovelMetadata,
  type WebNovelAuthor,
  type WebNovelProvider,
  WebNovelType,
  emptyPage,
} from './types';

import type { KyInstance } from 'ky';
import { parseJapanDateString } from '@/utils';
import { range } from 'lodash-es';
import PQueue from 'p-queue';
import { pipe } from 'fp-ts/lib/function.js';
import * as O from 'fp-ts/lib/Option.js';
import {
  removeSuffix,
  stringToAttentionEnum,
  substringAfterLast,
} from './utils';

const rangeIds = {
  每日: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  季度: 'quarter',
  每年: 'yearly',
  总计: 'total',
} as const;

const statusIds = {
  全部: 'total',
  短篇: 't',
  连载: 'r',
  完结: 'er',
} as const;

const genreIdsV1 = {
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

const genreIdsV2 = {
  恋爱: '1',
  幻想: '2',
  '文学/科幻/其他': 'o',
} as const;

export class Syosetu implements WebNovelProvider {
  readonly id = 'syosetu';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(
    options: Record<string, string>,
  ): Promise<Page<RemoteNovelListItem>> {
    const genreFilter = options['genre'];
    const rangeFilter = options['range'];
    if (rangeFilter == null) {
      return emptyPage();
    }
    const statusFilter = options['status'];
    if (statusFilter == null) {
      return emptyPage();
    }

    const rangeId = rangeIds[rangeFilter as keyof typeof rangeIds];
    const statusId = statusIds[statusFilter as keyof typeof statusIds];

    const page = Number(options['page']) || 1;

    const typeMappingStrategy = {
      流派: () =>
        pipe(
          O.fromNullable(genreIdsV1[genreFilter as keyof typeof genreIdsV1]),
          O.map(
            (genreId) => `genrelist/type/${rangeId}_${genreId}_${statusId}`,
          ),
        ),
      综合: () => O.some(`list/type/${rangeId}_${statusId}`),
      '异世界转生/转移': () =>
        pipe(
          O.fromNullable(genreIdsV2[genreFilter as keyof typeof genreIdsV2]),
          O.map(
            (genreId) => `isekailist/type/${rangeId}_${genreId}_${statusId}`,
          ),
        ),
    };

    const path = pipe(
      O.fromNullable(
        typeMappingStrategy[
          options['type'] as keyof typeof typeMappingStrategy
        ],
      ),
      O.chain((f) => f()),
      O.toNullable,
    );
    if (path == null) {
      return emptyPage();
    }

    const doc = await this.client
      .get(`https://yomou.syosetu.com/rank/${path}/?p=${page}`)
      .text();

    const $ = cheerio.load(doc);

    const pageNumber = $('.c-pager').first()?.children().length - 2;

    const items = $('.p-ranklist-item').map((_, item) => {
      const elTitle = $(item).find('div.p-ranklist-item__title > a').first();
      const title = elTitle.text().trim();
      const novelId = pipe(
        O.fromNullable(elTitle.attr('href')),
        O.map(removeSuffix('/')),
        O.map(substringAfterLast('/')),
        O.toNullable,
      );

      const attentions: WebNovelAttention[] = [];
      const keywords: string[] = [];

      $(item)
        .find('div.p-ranklist-item__keyword')
        .first()
        .find('a')
        .toArray()
        .map((el) => $(el).text().trim())
        .forEach((tagStr) => {
          const tagOrAttention = stringToAttentionEnum(tagStr);
          if (tagOrAttention !== null) {
            attentions.push(tagOrAttention);
          } else {
            keywords.push(tagStr);
          }
        });

      const elPoints = $(item).find('div.p-ranklist-item__points');
      const elInformation = $(item)
        .find('div.p-ranklist-item__infomation')
        .first();
      const seperators = $(elInformation)
        .find('p-ranklist-item__separator')
        .toArray();
      const extra = [...elPoints.toArray(), ...seperators]
        .map((el) => $(el).text().trim())
        .join('/');

      return <RemoteNovelListItem>{
        novelId,
        title,
        attentions,
        keywords,
        extra,
      };
    });

    return {
      items: items.get(),
      pageNumber,
    };
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const url1 = `https://ncode.syosetu.com/${novelId}`;
    const url2 = `https://ncode.syosetu.com/novelview/infotop/ncode/${novelId}`;
    const [doc1Html, doc2Html] = await Promise.all([
      this.client.get(url1).text(),
      this.client.get(url2).text(),
    ]);

    const $1 = cheerio.load(doc1Html);
    const $2 = cheerio.load(doc2Html);

    const title = $2('h1').first().text().trim();
    const infodataEl = $2('.p-infotop-data').first();
    const infotypeEl = $2('.p-infotop-type').first();

    const row = (label: string) => {
      return infodataEl.find(`dt:contains("${label}")`).first().next();
    };

    const authorEl = row('作者');
    const author: WebNovelAuthor = {
      name: authorEl.text().trim(),
      link: authorEl.find('a').attr('href') || null,
    };

    const typeStr = infotypeEl.find('.p-infotop-type__type').text().trim();

    let type: WebNovelType;
    switch (typeStr) {
      case '完結済':
        type = WebNovelType.Completed;
        break;
      case '連載中':
        type = WebNovelType.Ongoing;
        break;
      case '短編':
        type = WebNovelType.ShortStory;
        break;
      default:
        throw new Error(`无法解析的小说类型: ${typeStr}`);
    }

    const attentions: WebNovelAttention[] = [];
    const keywords: string[] = [];

    row('キーワード')
      .text()
      .trim()
      .split(' ')
      .flatMap((maybeTags) => maybeTags.split(' ')) // non-breaking space
      .flatMap((maybeTags) => maybeTags.split(' ')) // normal space
      .forEach((tag) => {
        const tagOrAttention = stringToAttentionEnum(tag);
        if (tagOrAttention !== null) {
          attentions.push(tagOrAttention);
        } else {
          keywords.push(tag);
        }
      });

    const isR18Str = infotypeEl.find('.p-infotop-type__r18').text().trim();
    if (isR18Str) {
      switch (isR18Str) {
        case 'R18':
          attentions.push(WebNovelAttention.R18);
          break;
        default:
          throw new Error(`无法解析的注意事项: ${isR18Str}`);
      }
    }

    const points = pipe(
      () =>
        row('総合評価').text().replace(/,/g, '').match(/(\d+)/)?.[1]?.trim(),
      Number,
      O.fromPredicate((n) => !isNaN(n)),
      O.toNullable,
    );

    const totalCharactersStr = row('文字数')
      .text()
      .replace(/,/g, '')
      .match(/(\d+)/)?.[1]
      ?.trim();
    const totalCharacters = pipe(
      Number(totalCharactersStr),
      O.fromPredicate((n) => !isNaN(n)),
      O.toNullable,
    );

    const introduction = pipe(
      O.fromNullable(row('あらすじ')),
      O.filter(($el) => $el.length > 0),
      O.map(($el) => $el.text().trim()),
      O.toNullable,
    );

    const tocEl = $1('div.p-eplist').first();
    const worker = async () => {
      if (tocEl.length === 0) {
        return [
          <TocItem>{
            title: '无名',
            chapterId: 'default',
          },
        ];
      } else {
        const pat = '/?p=';
        const href = $1('.c-pager__item--last').first().attr('href');
        const idx = href?.split(pat)?.[1]?.trim() || '';
        const totalPages = pipe(
          Number(idx),
          O.fromPredicate((n) => !isNaN(n)),
          O.getOrElse(() => 1),
        );

        const parseToc = ($: cheerio.CheerioAPI): TocItem[] =>
          $('div.p-eplist')
            .first()
            .children()
            .map((_, el) => {
              const link = $(el).find('a').first();

              if (link.length == 0) {
                return <TocItem>{
                  title: $(el).text().trim(),
                };
              }

              const title = link.text().trim();
              const chapterId = pipe(
                O.fromNullable(link.attr('href')),
                O.map(removeSuffix('/')),
                O.map(substringAfterLast('/')),
                O.toNullable,
              );

              const createAtStr = $('div.p-eplist__update')
                .contents()
                .filter((_, el) => el.type === 'text')
                .first()
                .text()
                .trim();
              const createAt = parseJapanDateString(
                'yyyy/MM/dd HH:mm',
                createAtStr,
              );

              return <TocItem>{
                title,
                chapterId,
                createAt,
              };
            })
            .get();

        const tocFirstPage = parseToc($1);
        const queue = new PQueue({ concurrency: 2 });
        const tasks: Promise<TocItem[]>[] = range(2, totalPages + 1).map(
          async (page) => {
            const url = `https://ncode.syosetu.com/${novelId}/?p=${page}`;
            const docHtml = await this.client.get(url).text();
            const $ = cheerio.load(docHtml);
            const tocPage = parseToc($);
            return tocPage;
          },
        );
        const tocs = await Promise.all(
          tasks.map((task) => queue.add(() => task)),
        );
        return tocFirstPage.concat(tocs.flat());
      }
    };

    const toc = await worker();

    return <RemoteNovelMetadata>{
      title,
      authors: [author],
      type,
      keywords,
      attentions,
      points,
      totalCharacters,
      introduction,
      toc,
    };
  }

  async getChapter(novelId: string, chapterId: string): Promise<RemoteChapter> {
    const url =
      chapterId === 'default'
        ? `https://ncode.syosetu.com/${novelId}`
        : `https://ncode.syosetu.com/${novelId}/${chapterId}`;

    const docHtml = await this.client.get(url).text();
    const $ = cheerio.load(docHtml);

    $('rp, rt').remove();
    $('br').replaceWith('\n');
    const paragraphs = $('div.p-novel__body > div > p')
      .map((_, p) => {
        const pElement = $(p);
        const imageElement = pElement.children().first().children().first();
        return imageElement.length > 0 && imageElement.is('img')
          ? `<图片>https:${imageElement.attr('src') ?? ''}`
          : pElement.text();
      })
      .get();
    return <RemoteChapter>{ paragraphs };
  }
}
