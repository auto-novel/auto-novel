import * as cheerio from 'cheerio';
import type { KyInstance } from 'ky';

import {
  type Page,
  type RemoteChapter,
  type RemoteNovelListItem,
  type RemoteNovelMetadata,
  type TocItem,
  WebNovelAttention,
  type WebNovelAuthor,
  type WebNovelProvider,
  WebNovelType,
  emptyPage,
} from './types';
import { removePrefix } from './utils';

const RANGE_IDS = {
  每日: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  每年: 'yearly',
  总计: 'entire',
} as const;

const GENRE_IDS = {
  综合: 'all',
  异世界幻想: 'fantasy',
  现代幻想: 'action',
  科幻: 'sf',
  恋爱: 'love_story',
  浪漫喜剧: 'romance',
  现代戏剧: 'drama',
  恐怖: 'horror',
  推理: 'mystery',
  '散文·纪实': 'nonfiction',
  '历史·时代·传奇': 'history',
  '创作论·评论': 'criticism',
  '诗·童话·其他': 'others',
} as const;

const STATUS_IDS = {
  全部: 'all',
  短篇: 'short',
  长篇: 'long',
} as const;

type GetRankOptions = {
  range: keyof typeof RANGE_IDS;
  genre: keyof typeof GENRE_IDS;
  status: keyof typeof STATUS_IDS;
};

function parseAttention(tag: string): WebNovelAttention | undefined {
  switch (tag.trim()) {
    case '残酷描写有り':
      return WebNovelAttention.Cruelty;
    case '暴力描写有り':
      return WebNovelAttention.Violence;
    case '性描写有り':
      return WebNovelAttention.SexualContent;
    default:
      return undefined;
  }
}

function parseWebNovelType(typeText: string): WebNovelType {
  switch (typeText) {
    case 'COMPLETED':
      return WebNovelType.Completed;
    case 'RUNNING':
      return WebNovelType.Ongoing;
    default:
      throw new Error(`无法解析的小说类型：${typeText}`);
  }
}

export class Kakuyomu implements WebNovelProvider<GetRankOptions> {
  readonly id = 'kakuyomu';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(options: GetRankOptions): Promise<Page<RemoteNovelListItem>> {
    const genreId = GENRE_IDS[options['genre']];
    if (!genreId) return emptyPage();

    const rangeId = RANGE_IDS[options['range']];
    if (!rangeId) return emptyPage();

    const statusId = STATUS_IDS[options['status']];
    if (!statusId) return emptyPage();

    const $ = await this.client
      .get(
        `https://kakuyomu.jp/rankings/${genreId}/${rangeId}?work_variation=${statusId}`,
      )
      .text()
      .then((text) => cheerio.load(text));

    const items = $('div.widget-media-genresWorkList-right > div.widget-work')
      .map((_, item) => {
        const root = $(item);
        const titleLink = root.find('a.bookWalker-work-title').first();

        const attentions: WebNovelAttention[] = [];
        root.find('b.widget-workCard-flags > span').each((_, tagEl) => {
          const attention = parseAttention($(tagEl).text());
          if (attention) {
            attentions.push(attention);
          }
        });

        return {
          novelId: titleLink.attr('href')
            ? removePrefix('/works/')(titleLink.attr('href')!)
            : '',
          title: titleLink.text().trim(),
          attentions,
          keywords: root
            .find('span.widget-workCard-tags > a')
            .map((_, el) => $(el).text().trim())
            .get(),
          extra: root
            .find('p.widget-workCard-meta')
            .children()
            .map((_, el) => $(el).text().trim())
            .get()
            .join(' / '),
        } satisfies RemoteNovelListItem;
      })
      .get()
      .filter((item) => item.novelId && item.title);

    return {
      items,
      pageNumber: 1,
    };
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const $ = await this.client
      .get(`https://kakuyomu.jp/works/${novelId}`)
      .text()
      .then((text) => cheerio.load(text));

    const script = $('#__NEXT_DATA__').first().html();
    if (!script) throw new Error('作品信息解析失败');

    const apollo = JSON.parse(script)?.props?.pageProps?.__APOLLO_STATE__;
    if (!apollo || typeof apollo !== 'object')
      throw new Error('作品信息解析失败');

    function unrefApollo(data: any): any {
      return apollo[data?.__ref] ?? undefined;
    }

    const work = apollo[`Work:${novelId}`];
    if (!work) throw new Error('作品信息解析失败');

    const title = work.alternativeTitle ?? work.title;
    if (!title) throw new Error('标题解析失败');

    const authorData = unrefApollo(work.author);
    if (!authorData?.activityName || !authorData?.name) {
      throw new Error('作者解析失败');
    }
    const authors: WebNovelAuthor[] = [
      {
        name: authorData.activityName,
        link: `https://kakuyomu.jp/users/${authorData.name}`,
      },
    ];

    const typeText = work.serialStatus;
    if (!typeText) {
      throw new Error('小说类型解析失败');
    }
    const type = parseWebNovelType(typeText);

    const attentions: WebNovelAttention[] = [];
    if (work.isCruel) attentions.push(WebNovelAttention.Cruelty);
    if (work.isViolent) attentions.push(WebNovelAttention.Violence);
    if (work.isSexual) attentions.push(WebNovelAttention.SexualContent);

    const keywords = Array.isArray(work.tagLabels) ? work.tagLabels : [];
    const points = work.totalReviewPoint ?? null;
    const totalCharacters = work.totalCharacterCount ?? 0;
    const introduction = work.introduction ?? '';

    const toc: TocItem[] = [];
    const tableOfContents = Array.isArray(work.tableOfContents)
      ? work.tableOfContents
      : [];
    for (const sectionRef of tableOfContents) {
      const section = unrefApollo(sectionRef);
      if (!section) {
        continue;
      }

      const chapter = unrefApollo(section.chapter);
      if (chapter?.title) {
        toc.push({
          title: chapter.title,
          chapterId: null,
          createAt: null,
        });
      }

      const episodes = Array.isArray(section.episodeUnions)
        ? section.episodeUnions
        : [];
      for (const episodeRef of episodes) {
        const episode = unrefApollo(episodeRef);
        if (!episode?.title || !episode?.id) {
          continue;
        }

        toc.push({
          title: episode.title,
          chapterId: episode.id,
          createAt: episode.publishedAt ?? null,
        });
      }
    }

    return {
      title,
      authors,
      type,
      attentions,
      keywords,
      points,
      totalCharacters,
      introduction,
      toc,
    };
  }

  async getChapter(novelId: string, chapterId: string): Promise<RemoteChapter> {
    const $ = await this.client
      .get(`https://kakuyomu.jp/works/${novelId}/episodes/${chapterId}`)
      .text()
      .then((text) => cheerio.load(text));

    $('rp, rt').remove();
    $('br').replaceWith('\n');

    const paragraphs = $('div.widget-episodeBody > p')
      .map((_, el) => $(el).text())
      .get();
    if (paragraphs.length === 0) {
      throw new Error('付费章节，无法获取');
    }

    return { paragraphs };
  }
}
