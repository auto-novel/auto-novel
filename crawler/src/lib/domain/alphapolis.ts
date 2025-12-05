import * as cheerio from 'cheerio';
import {
  type TocItem,
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
import * as NA from 'fp-ts/lib/NonEmptyArray.js';
import {
  assertEl,
  assertValid,
  numExtractor,
  stringToAttentionEnum,
  substringAfterLast,
} from './utils';

export class Alphapolis implements WebNovelProvider {
  readonly id = 'alphapolis';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(options: any): Promise<Page<RemoteNovelListItem>> {
    throw new Error('Not implemented');
  }

  private getMetadataUrl(novelId: string): string {
    return `https://www.alphapolis.co.jp/novel/${novelId.split('-').join('/')}`;
  }
  private getEpisodeUrl(novelId: string, chapterId: string): string {
    return `${this.getMetadataUrl(novelId)}/episode/${chapterId}`;
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const url = this.getMetadataUrl(novelId);
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const $contentInfo = $('#sidebar').first().find('.content-info').first();
    assertEl($contentInfo, 'doc parse failed');

    const $contentMain = $('#main').first().find('.content-main').first();
    assertEl($contentMain, 'doc parse failed');

    const $info = $contentInfo.find('.content-statuses').first();
    assertEl($info, 'doc parse failed');

    const $table = $contentInfo.find('table.detail').first();
    assertEl($table, 'doc parse failed');

    const row = (label: string) =>
      $table
        .find(`th`)
        .filter((_, el) => {
          const ownText = $(el)
            .contents()
            .filter((_, el) => el.type == 'text')
            .text();
          return ownText.includes(label);
        })
        .first()
        .next();

    const title = $contentMain.find('h1.title').first().text().trim();

    const authors = $contentMain
      .find('div.author a')
      .first()
      .map((_, a) => {
        const $a = $(a);
        return <WebNovelAuthor>{
          name: $a.text().trim(),
          link: $a.attr('href') || null,
        };
      })
      .get();

    const type = pipe(
      O.fromNullable($info.find('span.complete').first().text().trim()),
      O.map((ty) => {
        const mapping: Record<string, WebNovelType> = {
          連載中: WebNovelType.Ongoing,
          完結: WebNovelType.Completed,
        };
        const ret = mapping[ty];
        assertValid(ret, `无法解析的小说类型： ${ty}`);
        return ret;
      }),
      O.toNullable,
    );

    const attention = pipe(
      O.fromNullable($info.find('span.rating').first().text()),
      O.map(stringToAttentionEnum),
      O.toNullable,
    );

    const keywords = $contentMain
      .find('.content-tags > .tag')
      .map((_, el) => $(el).text().trim())
      .get();

    const points = numExtractor(row('累計ポイント').text().trim());

    const totalCharacters = numExtractor(row('文字数').text().trim());

    const introduction = pipe(
      O.fromNullable($contentMain.find('div.abstract').first()),
      O.filter(($el) => $el.length > 0),
      O.map(($el) => $el.text().trim()),
      O.toNullable,
    );

    const toc: TocItem[] = [];
    $('div.episodes')
      .children()
      .each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('chapter-rental')) {
          toc.push(<TocItem>{
            title: $el.find('h3').first().text().trim(),
          });
        } else if ($el.hasClass('rental')) {
          $el
            .find('div.rental-episode > a')
            .not('[class]')
            .each((_, el) => {
              const $it = $(el);
              toc.push(<TocItem>{
                title: $it.text().trim(),
                chapterId: pipe(
                  O.fromNullable($it.attr('href')),
                  O.map(substringAfterLast('/')),
                  O.toNullable,
                ),
              });
            });
        } else if (el.tagName == 'h3') {
          const chapterTitle = $el.text().trim();
          if (chapterTitle.length !== 0) {
            toc.push(<TocItem>{
              title: chapterTitle,
            });
          }
        } else if ($el.hasClass('episode')) {
          toc.push(<TocItem>{
            title: pipe(
              O.fromNullable($el.find('span.title').first()),
              O.filter(($it) => $it.length > 0),
              O.map(($it) => $it.text().trim()),
              O.getOrElseW(() => {
                throw new Error('episode title parse failed');
              }),
            ),
            chapterId: pipe(
              O.fromNullable($el.find('a').first().attr('href')),
              O.map(substringAfterLast('/')),
              O.toNullable,
            ),
          });
        }
      });

    return <RemoteNovelMetadata>{
      title,
      authors,
      type,
      attentions: attention ? [attention] : [],
      keywords,
      points,
      totalCharacters,
      introduction,
      toc,
    };
  }

  async getChapter(novelId: string, chapterId: string): Promise<RemoteChapter> {
    const url = this.getEpisodeUrl(novelId, chapterId);
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    let $els = $('div#novelBody');
    if ($els.length === 0) {
      $els = $('div.text');
    }
    assertEl($els, 'doc parse failed');

    $els.find('rp, rt').remove();
    $els.find('br').replaceWith('\n');

    const rawText = $els.text();

    const paragraphs = rawText.split(/\r?\n/).map((line) => line.trim());

    if (paragraphs.length < 5) {
      throw new Error('章节内容太少，爬取频率太快导致未加载');
    }
    return <RemoteChapter>{
      paragraphs,
    };
  }
}
