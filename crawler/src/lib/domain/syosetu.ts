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
} from './types';

import type { KyInstance } from 'ky';
import { parseJapanDateString } from '@/utils';
import { range } from 'lodash-es';
import PQueue from 'p-queue';
import { string } from 'zod';

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
    throw new Error('Not implemented');
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
      .map((maybeTags) => maybeTags.split(' '))
      .flat()
      .forEach((tag) => {
        if (tag === 'R15') {
          attentions.push(WebNovelAttention.R15);
        } else if (tag === '残酷な描写あり') {
          attentions.push(WebNovelAttention.Cruelty);
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

    const pointsStr = row('総合評価')
      .text()
      .replace(/,/g, '')
      .match(/(\d+)/)?.[1]
      ?.trim();
    const pointOrNaN = Number(pointsStr);
    const points = isNaN(pointOrNaN) ? null : pointOrNaN;

    const totalCharactersStr = row('文字数')
      .text()
      .replace(/,/g, '')
      .match(/(\d+)/)?.[1]
      ?.trim();
    const totalCharactersOrNaN = Number(totalCharactersStr);
    const totalCharacters = isNaN(totalCharactersOrNaN)
      ? null
      : totalCharactersOrNaN;

    const introduction = row('あらすじ').text().trim();

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
        const totalPagesOrNaN = Number(idx);
        const totalPages = isNaN(totalPagesOrNaN) ? 1 : totalPagesOrNaN;

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
              const chapterId =
                link
                  .attr('href')
                  ?.split('/')
                  ?.filter((e) => e.length !== 0)
                  ?.pop() ?? null;
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
