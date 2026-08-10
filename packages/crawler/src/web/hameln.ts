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

function collectMetadataTag(
  tag: string,
  attentions: WebNovelAttention[],
  keywords: string[],
) {
  if (!tag) {
    return;
  }

  const attention = stringToAttentionEnum(tag);
  if (attention) {
    if (!attentions.includes(attention)) {
      attentions.push(attention);
    }
    return;
  }

  if (!keywords.includes(tag)) {
    keywords.push(tag);
  }
}

function parseTitle(
  $list: Awaited<ReturnType<typeof fetchDocument>>,
  detailTitle: string,
) {
  const itempropTitle = $list('span[itemprop=name]').first().text().trim();
  if (itempropTitle) {
    return itempropTitle;
  }

  return (
    detailTitle ||
    $list('#maind > div.ss')
      .first()
      .find('span[style*="font-size:120%"] a')
      .first()
      .text()
      .trim()
  );
}

function parseAuthor(
  $list: Awaited<ReturnType<typeof fetchDocument>>,
): WebNovelAuthor {
  const authorCell = $list('span[itemprop=author]').first();
  const authorLink =
    authorCell.find('a').first().length > 0
      ? authorCell.find('a').first()
      : $list('#maind > div.ss').first().find('a[href*="/user/"]').first();

  return {
    name: (authorCell.text().trim() || authorLink.text().trim()).trim(),
    link: authorLink.attr('href'),
  };
}

function parseReaderChapterTitle(
  $list: Awaited<ReturnType<typeof fetchDocument>>,
) {
  return $list('#honbun')
    .prevAll('span[style*="font-size:120%"]')
    .first()
    .text()
    .trim();
}

function parseIntroduction($list: Awaited<ReturnType<typeof fetchDocument>>) {
  const introductionCell = $list('#maind > div.ss').eq(1).clone();
  const hasReaderBody = introductionCell.find('#honbun').length > 0;

  if (hasReaderBody) {
    introductionCell.find('#maegaki, #maegaki_open, #honbun').remove();
    introductionCell.find('div[style*="text-align:right"]').remove();
    introductionCell.children('p').remove();
    introductionCell.children('span[style*="font-size:120%"]').remove();
  }

  introductionCell.find('br').replaceWith('\n');

  return introductionCell.text().trim();
}

export class Hameln implements WebNovelProvider {
  readonly id = 'hameln';
  readonly version = '1.0.0';

  client: KyInstance;

  constructor(client: KyInstance) {
    this.client = client;
  }

  async getRank(
    _options: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return emptyPage();
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata> {
    const [$list, $detail] = await Promise.all([
      fetchDocument(this.client, `https://syosetu.org/novel/${novelId}`),
      fetchDocument(
        this.client,
        `https://syosetu.org/?mode=ss_detail&nid=${novelId}`,
      ),
    ]);

    const optionalRow = (label: string) => {
      const cell = $detail('td')
        .toArray()
        .find((el) => $detail(el).text().trim() === label);
      return cell ? $detail(cell).next('td') : null;
    };

    const row = (label: string) => {
      const value = optionalRow(label);
      if (!value || value.length === 0) {
        throw new CrawlerParseError(`未找到字段：${label}`);
      }

      return value;
    };

    const attentions: WebNovelAttention[] = [];
    const keywords: string[] = [];

    const title = parseTitle(
      $list,
      optionalRow('タイトル')?.text().trim() ?? '',
    );
    if (!title) {
      throw new CrawlerParseError('标题解析失败');
    }
    const author = parseAuthor($list);

    const topBlock = $list('#maind > div.ss').first();
    topBlock.find('span[itemprop=genre] a').each((_, el) => {
      collectMetadataTag($list(el).text().trim(), attentions, keywords);
    });

    topBlock
      .find('a[href*="search/?mode=search"], a[href*="/search/"]')
      .each((_, el) => {
        collectMetadataTag($list(el).text().trim(), attentions, keywords);
      });

    const introduction = parseIntroduction($list);

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
        : [
            {
              title: parseReaderChapterTitle($list) || title || '无名',
              chapterId: 'default',
              createAt: defaultCreateAt,
            },
          ];

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
        ? `https://syosetu.org/novel/${novelId}`
        : `https://syosetu.org/novel/${novelId}/${chapterId}.html`;

    const $ = await fetchDocument(this.client, url);

    const paragraphs = $('div#honbun')
      .first()
      .find('p')
      .map((_, el) => {
        const $el = $(el);
        $el.find('rp, rt').remove();
        return $el;
      })
      .filter((_, el) => Boolean(el.attr('id')))
      .map((_, el) => el.text())
      .get();

    return { paragraphs };
  }
}
