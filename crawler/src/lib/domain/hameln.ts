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
  emptyPage,
  WebNovelAttention,
} from './types';

import type { KyInstance } from 'ky';
import { pipe } from 'fp-ts/lib/function.js';
import * as O from 'fp-ts/lib/Option.js';
import * as A from 'fp-ts/lib/Array.js';
import * as NA from 'fp-ts/lib/NonEmptyArray.js';
import {
  assertValid,
  stringToAttentionEnum,
  substringAfterLast,
  numExtractor,
  removePrefix,
  removeSuffix,
} from './utils';
import PQueue from 'p-queue';
import { parseJapanDateString } from '@/utils';
import { el } from 'date-fns/locale';
import { number } from 'zod';
import { replace } from 'lodash-es';
import { parse } from 'path';
import { _toLowerCase } from 'zod/v4/core';
import e from 'express';

export class Hameln implements WebNovelProvider {
  readonly id = 'hameln';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  readonly URL_ORIGIN = 'https://syosetu.org';
  readonly URL_PROXY = 'https://hml.xkvi.top';

  private options = {
    useProxy: false,
  };

  private get baseUrl() {
    return this.options.useProxy ? this.URL_PROXY : this.URL_ORIGIN;
  }

  setOptions(options: typeof this.options) {
    this.options = options;
  }

  async getRank(options: any): Promise<Page<RemoteNovelListItem>> {
    throw new Error('Not implemented');
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const url1 = `${this.baseUrl}/novel/${novelId}`;
    const url2 = `${this.baseUrl}/?mode=ss_detail&nid=${novelId}`;
    const worker = (url: string) =>
      this.client
        .get(url)
        .text()
        .then((doc) => cheerio.load(doc));
    const [$1, $2] = await Promise.all([worker(url1), worker(url2)]);

    const row = (label: string) => {
      const ret = pipe(
        $2(`td`).toArray(),
        A.findFirst((el) => $2(el).text().trim() === label),
        O.map((el) => $2(el).next()),
        O.filter((el) => el.length > 0),
        O.toNullable,
      );
      const msg = `Failed to find row: ${label}`;
      assertValid(ret, msg);
      if (ret.length === 0) throw new Error(msg);
      return ret;
    };

    const title = row('タイトル').text().trim();

    const author = pipe(row('作者'), (el) => {
      const a = el.find('a').first();
      return <WebNovelAuthor>{
        name: el.text().trim(),
        link: a.attr('href')?.replace(this.URL_ORIGIN, this.baseUrl),
      };
    });

    const type = pipe(row('話数').text().trim(), (text) => {
      const matchers: [string, WebNovelType][] = [
        ['連載(完結)', WebNovelType.Completed],
        ['連載(未完)', WebNovelType.Ongoing],
        ['連載(連載中)', WebNovelType.Ongoing],
        ['短編', WebNovelType.ShortStory],
      ];
      const match = matchers.find(([prefix]) => text.startsWith(prefix));
      if (!match) throw new Error(`无法解析的小说类型:${text}`);
      return match[1];
    });

    const attentions: WebNovelAttention[] = [];
    const keywords: string[] = [];

    row('原作')
      .find('a')
      .each((_, el) => {
        const tag = $2(el).text().trim();
        keywords.push(tag);
      });

    ['タグ', '必須タグ']
      .flatMap((label) => row(label).find('a').toArray())
      .map((el) => $2(el).text().trim())
      .forEach((tag) => {
        const tagOrAttention = stringToAttentionEnum(tag);
        if (tagOrAttention) {
          attentions.push(tagOrAttention);
        } else {
          keywords.push(tag);
        }
      });

    const points = numExtractor(row('総合評価').text().trim());
    const totalCharacters = numExtractor(row('合計文字数').text().trim());

    const introduction = pipe(
      O.fromNullable(row('あらすじ')),
      O.filter(($el) => $el.length > 0),
      O.map(($el) => $el.text().trim()),
      O.toNullable,
    );

    const toc: TocItem[] =
      $1('span[itemprop=name]').length === 0
        ? [<TocItem>{ title: '无名', chapterId: 'default' }]
        : $1('tbody > tr')
            .map((_, tr) => {
              const $tr = $1(tr);
              const $a = $tr.find('a').first();

              return $a.length === 0
                ? <TocItem>{ title: $tr.text().trim() }
                : <TocItem>{
                    title: $a.text().trim(),
                    chapterId: pipe(
                      O.fromNullable($a.attr('href')),
                      O.map(removePrefix('./')),
                      O.map(removeSuffix('.html')),
                      O.toNullable,
                    ),
                    createAt: parseJapanDateString(
                      'yyyy年MM月dd日 HH:mm',
                      $tr
                        .find('nobr')
                        .contents()
                        .first()
                        .text()
                        .replace(/\(.*?\)/g, '')
                        .trim(),
                    ),
                  };
            })
            .get();

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
    const url =
      chapterId === 'default'
        ? `${this.baseUrl}/novel/${novelId}`
        : `${this.baseUrl}/novel/${novelId}/${chapterId}.html`;

    const doc = await this.client.get(url).text();
    const $ = cheerio.load(doc);

    const paragraphs: string[] = $('div#honbun')
      .first()
      .find('p')
      .map((_, el) => {
        const $el = $(el);
        $el.find('rp, rt').remove();
        $el.find('br').replaceWith('\n');
        return $el;
      })
      .filter((_, el) => Boolean(el.attr('id')))
      .map((_, el) => el.text().trim())
      .get();

    return <RemoteChapter>{
      paragraphs,
    };
  }
}
