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
} from './types';
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

  throw new Error(`无法解析的小说类型:${text}`);
}

function parseTocFromEpisodeList(
  $list: Awaited<ReturnType<typeof fetchDocument>>,
) {
  return $list('.episode-list__items')
    .first()
    .children('li')
    .map((_, li) => {
      const $li = $list(li);

      if ($li.hasClass('episode-list__chapter')) {
        return {
          title:
            $li.find('.episode-list__chapter-title').text().trim() ||
            $li.text().trim(),
          chapterId: null,
          createAt: null,
        } satisfies WebNovelTocItem;
      }

      const $a = $li.find('a').first();
      if ($a.length === 0) {
        return {
          title: $li.text().trim(),
          chapterId: null,
          createAt: null,
        } satisfies WebNovelTocItem;
      }

      const href = $a.attr('href') ?? '';
      const rawDate = $a.find('time.episode-list__date').text().trim();

      return {
        title:
          $a.find('.episode-list__title').text().trim() || $a.text().trim(),
        chapterId: removeSuffix('.html')(removePrefix('./')(href)),
        createAt:
          parseJapanDateString('yyyy/MM/dd HH:mm', rawDate)?.toISOString() ??
          null,
      } satisfies WebNovelTocItem;
    })
    .get();
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
    throw new Error('Not implemented');
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata | null> {
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
        throw new Error(`Failed to find row: ${label}`);
      }

      const value = $detail(cell).next('td');
      if (value.length === 0) {
        throw new Error(`Failed to find row: ${label}`);
      }

      return value;
    };

    const attentions: WebNovelAttention[] = [];
    const keywords: string[] = [];

    const title = $list('span[itemprop=name]').first().text().trim();
    const authorCell = $list('span[itemprop=author]').first();
    const authorLink = authorCell.find('a').first();
    const author: WebNovelAuthor = {
      name: authorCell.text().trim(),
      link: authorLink.attr('href')?.replace(this.URL_ORIGIN, this.baseUrl),
    };

    const topBlock = $list('#maind > div.ss').first();
    topBlock.find('span[itemprop=genre] a').each((_, el) => {
      const tag = $list(el).text().trim();
      if (tag) {
        keywords.push(tag);
      }
    });

    topBlock.find('a.alert_color, span[itemprop=keywords] a').each((_, el) => {
      const tag = $list(el).text().trim();
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

    const introductionCell = $list('#maind > div.ss').eq(1).clone();
    introductionCell.find('br').replaceWith('\n');
    const introduction = introductionCell.text().trim();

    const points = numExtractor(row('総合評価').text().trim());
    const totalCharacters = numExtractor(row('合計文字数').text().trim()) ?? 0;
    const defaultCreateAt =
      parseJapanDateString(
        'yyyy年MM月dd日 HH:mm',
        row('掲載開始')
          .text()
          .replace(/\(.*?\)/g, '')
          .trim(),
      )?.toISOString() ?? null;

    const toc: WebNovelTocItem[] =
      $list('.episode-list__items').length > 0
        ? parseTocFromEpisodeList($list)
        : [{ title: '无名', chapterId: 'default', createAt: defaultCreateAt }];

    const typeCell = row('話数');
    if (!typeCell) {
      throw new Error('Failed to find row: 話数');
    }
    const type = parseWebNovelType(typeCell.text().trim());

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
