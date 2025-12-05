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
import * as A from 'fp-ts/lib/Array.js';
import * as NA from 'fp-ts/lib/NonEmptyArray.js';
import {
  assertValid,
  numExtractor,
  removePrefix,
  stringToAttentionEnum,
  substringAfterLast,
} from './utils';
import z from 'zod';
import { assert } from 'console';
import PQueue from 'p-queue';
import { parseJapanDateString } from '@/utils';

export class Novelup implements WebNovelProvider {
  readonly id = 'novelup';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(options: any): Promise<Page<RemoteNovelListItem>> {
    throw new Error('Not implemented');
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const url = `https://novelup.plus/story/${novelId}`;
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const $info = $('table.storyMeta');

    const row = (label: string) =>
      $info
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

    const title = $('h1.storyTitle').text().trim();

    const author = $('a.storyAuthor')
      .first()
      .map(
        (_, el) =>
          <WebNovelAuthor>{
            name: $(el).text().trim(),
            link: $(el).attr('href') || null,
          },
      )
      .get();

    const mapping: Record<string, WebNovelType> = {
      連載中: WebNovelType.Ongoing,
      完結済: WebNovelType.Completed,
    };
    const type = pipe(
      O.fromNullable($('p.state_lamp span').last().text().trim()),
      O.filter(Boolean),
      O.map((ty) => {
        const ret = mapping[ty];
        assertValid(ret, `无法解析的小说类型： ${ty}`);
        return ret;
      }),
      O.toNullable,
    );

    const attentions = pipe(
      row('セルフレイティング').contents().toArray(),
      A.filterMap((node) => {
        if (node.type !== 'text') return O.none;
        const text = $(node).text().trim();
        const attention = stringToAttentionEnum(text);
        return attention ? O.some(attention) : O.none;
      }),
    );

    const keywords = row('タグ')
      .children()
      .map((_, el) => $(el).text().trim())
      .get();

    const points = numExtractor(row('応援ポイント').text().trim());
    const totalCharacters = numExtractor(row('文字数').text().trim());

    const introduction = pipe(
      O.fromNullable($('div.novel_synopsis')),
      O.filter(($el) => $el.length > 0),
      O.map(($el) => $el.text().trim()),
      O.toNullable,
    );

    const totalPage = pipe(
      O.fromNullable($('ul.pagination').children().last()),
      O.map((el) => $(el).find('a').attr('href')),
      O.chain(O.fromNullable),
      O.map(substringAfterLast('=')),
      O.map(Number),
      O.filter(Number.isFinite),
      O.getOrElse(() => 1),
    );

    const fetchDocPromise = pipe(
      NA.range(1, totalPage),
      A.map(async (page) => {
        if (page === 1) return $;
        else {
          const url = await `https://novelup.plus/story/${novelId}?p=${page}`;
          const doc = await this.client.get(url).text();
          return cheerio.load(doc);
        }
      }),
    );
    const queue = new PQueue({ concurrency: 2 });
    const tocs = await Promise.all(
      fetchDocPromise.map((promise) => queue.add(() => promise)),
    );

    const toc = pipe(
      tocs,
      A.map(($sub) =>
        $sub('div.episodeList')
          .first()
          .find('div.episodeListItem')
          .map((_, li) => {
            const a = $sub(li).find('a').first();
            if (a.length === 0) {
              return <TocItem>{ title: $sub(li).text().trim() };
            }

            const title_no = $sub(a).attr('data-number')?.trim();
            const title_text = $sub(a).text()?.trim();
            const title = `${title_no} ${title_text}`.trim();
            const chapterId = pipe(
              O.fromNullable($(a).attr('href')),
              O.map(substringAfterLast('/')),
              O.toNullable,
            );
            const createAt = pipe(
              O.fromNullable(
                '20' + $sub(li).find('p.publishDate').text().trim(),
              ),
              O.map((str) => parseJapanDateString('yyyy/M/dd HH:mm', str)),
              O.toNullable,
            );
            return <TocItem>{ title, chapterId, createAt };
          })
          .get(),
      ),
      A.flatten,
    );

    return <RemoteNovelMetadata>{
      title,
      authors: author,
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
    const url = `https://novelup.plus/story/${novelId}/${chapterId}`;
    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const $el = $('p#episode_content').first();

    $el.find('rp, rt').remove();
    $el.find('br').replaceWith('\n');

    const texts = $el.text();
    const lines = texts.split(/\r?\n/).map((line) => line.trim());

    return <RemoteChapter>{
      paragraphs: lines,
    };
  }
}
