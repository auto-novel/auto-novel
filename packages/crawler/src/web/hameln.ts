import type { KyInstance } from 'ky';

import {
  type Page,
  type WebNovelAuthor,
  type WebNovelChapter,
  type WebNovelListItem,
  type WebNovelMetadata,
  type WebNovelProvider,
  type WebNovelTocItem,
  WebNovelAttention,
  WebNovelType,
  emptyPage,
} from './types';
import { CrawlerParseError } from '@/errors';
import {
  fetchDocument,
  numExtractor,
  parseJapanDateString,
  removePrefix,
  removeSuffix,
  stringToAttentionEnum,
} from './utils';

function parseWebNovelType(text: string): WebNovelType {
  if (text.startsWith('連載(完結)')) {
    return WebNovelType.Completed;
  }
  if (text.startsWith('連載(未完)') || text.startsWith('連載(連載中)')) {
    return WebNovelType.Ongoing;
  }
  if (text.startsWith('短編')) {
    return WebNovelType.ShortStory;
  }

  throw new CrawlerParseError(`无法解析的小说类型:${text}`);
}

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

  async getRank(
    _options: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return emptyPage();
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata> {
    const [$list, $detail] = await Promise.all([
      fetchDocument(this.client, `${this.baseUrl}/novel/${novelId}`),
      fetchDocument(
        this.client,
        `${this.baseUrl}/?mode=ss_detail&nid=${novelId}`,
      ),
    ]);

    const row = (label: string) => {
      const cell = $detail('td')
        .toArray()
        .find((el) => $detail(el).text().trim() === label);
      if (!cell) {
        throw new CrawlerParseError(`未找到字段：${label}`);
      }

      const value = $detail(cell).next();
      if (value.length === 0) {
        throw new CrawlerParseError(`未找到字段：${label}`);
      }

      return value;
    };

    const title = row('タイトル').text().trim();

    const authorCell = row('作者');
    const authorLink = authorCell.find('a').first();
    const author: WebNovelAuthor = {
      name: authorCell.text().trim(),
      link: authorLink.attr('href')?.replace(this.URL_ORIGIN, this.baseUrl),
    };

    const type = parseWebNovelType(row('話数').text().trim());

    const attentions: WebNovelAttention[] = [];
    const keywords: string[] = [];

    row('原作')
      .find('a')
      .each((_, el) => {
        const tag = $detail(el).text().trim();
        if (tag) {
          keywords.push(tag);
        }
      });

    for (const label of ['タグ', '必須タグ']) {
      row(label)
        .find('a')
        .each((_, el) => {
          const tag = $detail(el).text().trim();
          if (!tag) {
            return;
          }

          const attention = stringToAttentionEnum(tag);
          if (attention) {
            attentions.push(attention);
          } else {
            keywords.push(tag);
          }
        });
    }

    const points = numExtractor(row('総合評価').text().trim());
    const totalCharacters = numExtractor(row('合計文字数').text().trim()) ?? 0;
    const introductionCell = row('あらすじ').clone();
    introductionCell.find('br').replaceWith('\n');
    const introduction = introductionCell.text().trim();

    const toc: WebNovelTocItem[] =
      $list('span[itemprop=name]').length === 0
        ? [{ title: '无名', chapterId: 'default', createAt: null }]
        : $list('tbody > tr')
            .map((_, tr) => {
              const $tr = $list(tr);
              const $a = $tr.find('a').first();
              if ($a.length === 0) {
                return {
                  title: $tr.text().trim(),
                  chapterId: null,
                  createAt: null,
                } satisfies WebNovelTocItem;
              }

              const href = $a.attr('href') ?? '';
              const rawDate = $tr
                .find('nobr')
                .contents()
                .first()
                .text()
                .replace(/\(.*?\)/g, '')
                .trim();

              return {
                title: $a.text().trim(),
                chapterId: removeSuffix('.html')(removePrefix('./')(href)),
                createAt:
                  parseJapanDateString(
                    'yyyy年MM月dd日 HH:mm',
                    rawDate,
                  )?.toISOString() ?? null,
              } satisfies WebNovelTocItem;
            })
            .get();

    return {
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

  async getChapter(
    novelId: string,
    chapterId: string,
  ): Promise<WebNovelChapter> {
    const url =
      chapterId === 'default'
        ? `${this.baseUrl}/novel/${novelId}`
        : `${this.baseUrl}/novel/${novelId}/${chapterId}.html`;

    const $ = await fetchDocument(this.client, url);

    const paragraphs = $('div#honbun')
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

    return { paragraphs };
  }
}
