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
import { pipe } from 'fp-ts/lib/function.js';
import * as O from 'fp-ts/lib/Option.js';
import { removePrefix, stringToTagEnum } from './utils';

const rangeIds = {
  每日: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  每年: 'yearly',
  总计: 'total',
} as const;

const genreIds = {
  综合: 'all',
  异世界幻想: 'fantasy',
  现代幻想: 'action',
  科幻: 'sf',
  恋爱: 'love_story',
  浪漫喜剧: 'romance',
  现代戏剧: 'drama',
  恐怖: 'horror',
  推理: 'mystery',
  散文·纪实: 'nonfiction',
  历史·时代·传奇: 'history',
  创作论·评论: 'criticism',
  诗·童话·其他: 'others',
} as const;

const statusIds = {
  全部: 'all',
  短篇: 'short',
  长篇: 'long',
} as const;

export class Kakuyomu implements WebNovelProvider {
  readonly id = 'kakuyomu';
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

    // FIXME(kuriko): not working currently
    const url = `https://kakuyomu.jp/rankings/${genreFilter}/${rangeFilter}?work_variation=${statusFilter}`;
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const items = $(
      'div.widget-media-genresWorkList-right > div.widget-work',
    ).map((_, workCard) => {
      const a = $(workCard).find('a.bookWalker-work-title').first();
      const novelId = pipe(
        O.fromNullable(a.attr('href')),
        O.map(removePrefix('/works/')),
        O.toNullable,
      );
      const title = a.text().trim();

      const attentions: WebNovelAttention[] = $(workCard)
        .find('a.bookWalker-work-title')
        .map((_, el) => stringToTagEnum($(el).text().trim()))
        .get();

      const keywords: string[] = $(workCard)
        .find('span.widget-workCard-tags > a')
        .map((_, el) => $(el).text().trim())
        .get();

      const extra = $(workCard)
        .find('p.widget-workCard-meta')
        ?.children()
        .map((_, el) => $(el).text().trim())
        .toArray()
        .join(' / ');

      return <RemoteNovelListItem>{
        novelId,
        title,
        attentions,
        keywords,
        extra,
      };
    });

    return <Page<RemoteNovelListItem>>{
      items: items.get(),
      pageNumber: 1,
    };
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    throw new Error('Method not implemented.');
  }

  async getChapter(novelId: string, chapterId: string): Promise<RemoteChapter> {
    const url = `https://kakuyomu.jp/works/${novelId}/episodes/${chapterId}`;
    console.log(url);
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    $('rp').remove();
    $('rt').remove();

    const paragraphs = $('div.widget-episodeBody > p').map((_, el) =>
      $(el).text(),
    );
    if (paragraphs.length === 0) {
      throw new Error('付费章节，无法获取');
    }
    return <RemoteChapter>{ paragraphs: paragraphs.toArray() };
  }
}
