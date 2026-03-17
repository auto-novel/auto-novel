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
import { pipe } from 'fp-ts/lib/function.js';
import * as O from 'fp-ts/lib/Option.js';
import * as A from 'fp-ts/lib/Array.js';
import { assertValid, removePrefix, stringToAttentionEnum } from './utils';
import z from 'zod';

const rangeIds = {
  每日: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  每年: 'yearly',
  总计: 'entire',
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

const rankSchema = z.object({
  genre: z.enum(Object.keys(genreIds)),
  range: z.enum(Object.keys(rangeIds)),
  status: z.enum(Object.keys(statusIds)),
});

export type Options = z.input<typeof rankSchema>;

export class Kakuyomu implements WebNovelProvider<Options> {
  readonly id = 'kakuyomu';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(options: Options): Promise<Page<RemoteNovelListItem>> {
    // FIXME(kuriko): should we use safeParse to return emptyPage()?
    const params = rankSchema.parse(options) as {
      genre: keyof typeof genreIds;
      range: keyof typeof rangeIds;
      status: keyof typeof statusIds;
    };
    const genre = genreIds[params.genre];
    const range = rangeIds[params.range];
    const status = statusIds[params.status];

    const url = `https://kakuyomu.jp/rankings/${genre}/${range}?work_variation=${status}`;
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
        .map((_, el) => stringToAttentionEnum($(el).text().trim()))
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
    const url = `https://kakuyomu.jp/works/${novelId}`;
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const script = $('#__NEXT_DATA__');
    if (script.length === 0) {
      return null;
    }

    const apollo = JSON.parse(script.html() ?? '')?.props?.pageProps?.[
      '__APOLLO_STATE__'
    ];

    assertValid(apollo, 'Failed to parse novel metadata');

    const unref = (data: any) => {
      if (data?.__ref) {
        return apollo[data.__ref];
      }
      return null;
    };

    const work = apollo[`Work:${novelId}`];

    const title = work?.alternativeTitle ?? work?.title;

    const author = pipe(
      O.fromNullable(work?.author),
      O.map(unref),
      O.map(
        (it) =>
          <WebNovelAuthor>{
            name: it.activityName,
            link: `https://kakuyomu.jp/users/${it.name}`,
          },
      ),
      O.toNullable,
    );

    const typeMap: Record<string, WebNovelType> = {
      COMPLETED: WebNovelType.Completed,
      RUNNING: WebNovelType.Ongoing,
    };

    const status: string = work?.serialStatus;
    const type = typeMap[status];
    assertValid(type, `无法解析的小说类型：${status}`);

    const attentions: WebNovelAttention[] = [];
    if (work?.isCruel) attentions.push(WebNovelAttention.Cruelty);
    if (work?.isViolent) attentions.push(WebNovelAttention.Violence);
    if (work?.isSexual) attentions.push(WebNovelAttention.SexualContent);

    const keywords = work?.tagLabels ?? [];

    const points = work?.totalReviewPoint;

    const totalCharacters = work?.totalCharacterCount;

    const introduction = work?.introduction;

    const toc = pipe(
      O.fromNullable(work?.tableOfContents),
      O.map(A.map(unref)),
      O.map(
        A.chain((it) => {
          const chapter = pipe(
            O.fromNullable(it?.chapter),
            O.map(unref),
            O.toNullable,
          );
          const episodes = pipe(
            O.fromNullable(it?.episodeUnions),
            O.map(A.map(unref)),
            O.toNullable,
          );
          const ret: TocItem[] = [];
          if (chapter) {
            ret.push(<TocItem>{
              title: chapter.title,
            });
          }
          const episodeData =
            episodes?.map(
              (ep) =>
                <TocItem>{
                  title: ep.title,
                  chapterId: ep.id,
                  createAt: ep.publishedAt,
                },
            ) ?? [];
          return [...ret, ...episodeData];
        }),
      ),
      O.toNullable,
    );

    return <RemoteNovelMetadata>{
      title,
      authors: [author],
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
    const url = `https://kakuyomu.jp/works/${novelId}/episodes/${chapterId}`;
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    $('rp, rt').remove();
    $('br').replaceWith('\n');

    const paragraphs = $('div.widget-episodeBody > p').map((_, el) =>
      $(el).text(),
    );
    if (paragraphs.length === 0) {
      throw new Error('付费章节，无法获取');
    }
    return <RemoteChapter>{ paragraphs: paragraphs.toArray() };
  }
}
