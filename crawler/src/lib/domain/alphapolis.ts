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
    // this.client = client;
    this.client = client.extend({
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US',
        'Accept-Encoding': 'gzip, deflate, br, zstd',

        Cookie:
          '823acvandu8=; ga1e74ugjok=; AWSALB=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; AWSALBCORS=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; XSRF-TOKEN=eyJpdiI6IjI5aklNOFVIZ0lDcGh5NlJqMFZOV0E9PSIsInZhbHVlIjoiQi8xYjJBSTNYbVBWMHY5U3kwdDJlOVRlbVF0blFIY05jQWRXWDVmZm9Rc0E1UGdRc25WNXpwU1VGZ3QxVm5EMFVXYTg3ZDR0NUd0bDk2V0ZEczF4QU81YXRRT0NEV1p3aUduamtqWDhjbGVZODFQQVVUOWZKRzFXR3psR3dneUQiLCJtYWMiOiI1MDdmNzY4NDgxOTk3M2Y0ZmMyYjNiYTFjODQ1YzhlYmM3NmE2ZDA5OTcyZDMwYTE0NDFkMWI2NDU4MDk1MjVjIiwidGFnIjoiIn0%3D; alpl_v2_front_session=eyJpdiI6ImRSU3hQN01YNk1LSTZaclNOT3l5VlE9PSIsInZhbHVlIjoidlFWLzNYVU5UK2tSMmYwLzBMc00vajZ5R0pobksxS1Bwc0QyUVNwSUlNbFJzdi83Y0w5R0FwWXRFQW5RRjBWc1J0OW5zT1hQUTBoOVBhZk9VbGFMWlhMdSs5Znp6RDhQVVFtUmVQUEdxdnJuQUNaMkNyTms1bzRDcVIrU2NuTVgiLCJtYWMiOiJmZDE5ZDk5YzdiY2JmNzNiOGM5MjhlMWZhNGExMDkzYWNkMGRjNzA4MzkwNDRjZTVhYWM2MmUzYzhjMmYyMjE4IiwidGFnIjoiIn0%3D; device_uuid=eyJpdiI6IlNjM2NNdmxTTDE3OWRPbk45RkF5REE9PSIsInZhbHVlIjoib2dmcnNueUM0cDAycXgxejFwc05aVDBDUU9FeGpMbUxFSUFKZkkxSldjSWR5Z3QvYkJ6ZExoQ0NBQ0Q4QWFERUJYaFZYZGRuWEJGQkhSN3hNWlIrUjJ1bHlwVTJiejNuV1J0NTBuSHdmT2c9IiwibWFjIjoiYjcwODA1NDM1NjBiZjhjYzZiMzM2OTdjYjFiMDE4YTdhZmQ1ZDgwZGJiZTQyMTM1MDUyYjBjZGVkZDRmYWJkMyIsInRhZyI6IiJ9; krt_rewrite_uid=a87ff6ca-84ea-47e5-afa2-17eed43e4826; twtr_pixel_opt_in=N; aws-waf-token=41b61326-cf35-4a29-bacd-0f6264247bd7:AQoAdcQy2TXrAAAA:P9AOyR69CQryJtoy8FOh0ViT1hilKsxaCJxSJMp04AdanowlucZleAtlt45fLTGU5nEbhmkKfz2uWYc+lM0Wwp4TE++VDtYKErjv1Jg/f80nCugI8AYM5gurkRBCgp0fNWqWiIeXqfD4/Z781AO7WviOMKSkKJxOOmHHxOCHH3YjQAAVuxgCV2IgVrKlTljpHq8zjKw=',
      },
    });
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

    $els.find('rp rt').remove();
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
