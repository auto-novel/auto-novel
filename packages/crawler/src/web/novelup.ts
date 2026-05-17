import type { KyInstance } from 'ky';

import {
  type Page,
  type WebNovelAuthor,
  type WebNovelChapter,
  type WebNovelListItem,
  type WebNovelMetadata,
  type WebNovelProvider,
  type WebNovelTocItem,
  WebNovelType,
  emptyPage,
} from './types';
import { CrawlerParseError } from '@/errors';
import {
  fetchDocument,
  numExtractor,
  parseJapanDateString,
  stringToAttentionEnum,
  substringAfterLast,
} from './utils';

function parseWebNovelType(typeText: string): WebNovelType {
  switch (typeText) {
    case '連載中':
      return WebNovelType.Ongoing;
    case '完結済':
      return WebNovelType.Completed;
    default:
      throw new CrawlerParseError(`无法解析的小说类型： ${typeText}`);
  }
}

export class Novelup implements WebNovelProvider {
  readonly id = 'novelup';
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
    const $ = await fetchDocument(
      this.client,
      `https://novelup.plus/story/${novelId}`,
    );

    const $info = $('table.storyMeta');
    const row = (label: string) =>
      $info
        .find('th')
        .filter((_, el) => {
          const ownText = $(el)
            .contents()
            .filter((_, child) => child.type === 'text')
            .text();
          return ownText.includes(label);
        })
        .first()
        .next();

    const title = $('h1.storyTitle').text().trim();

    const authors = $('a.storyAuthor')
      .first()
      .map(
        (_, el) =>
          ({
            name: $(el).text().trim(),
            link: $(el).attr('href') || null,
          }) satisfies WebNovelAuthor,
      )
      .get();

    const typeText = $('p.state_lamp span').last().text().trim();
    const type = parseWebNovelType(typeText);

    const attentions = row('セルフレイティング')
      .contents()
      .toArray()
      .flatMap((node) => {
        if (node.type !== 'text') {
          return [];
        }

        const attention = stringToAttentionEnum($(node).text().trim());
        return attention ? [attention] : [];
      });

    const keywords = row('タグ')
      .children()
      .map((_, el) => $(el).text().trim())
      .get();

    const points = numExtractor(row('応援ポイント').text().trim());
    const totalCharacters = numExtractor(row('文字数').text().trim()) ?? 0;
    const introduction = $('div.novel_synopsis').first().text().trim();

    const paginationHref = $('ul.pagination')
      .children()
      .last()
      .find('a')
      .attr('href');
    const totalPage = (() => {
      if (!paginationHref) {
        return 1;
      }

      const value = Number(substringAfterLast('=')(paginationHref));
      return Number.isFinite(value) && value > 0 ? value : 1;
    })();

    const pages = [$];
    for (let page = 2; page <= totalPage; page += 1) {
      const $sub = await fetchDocument(
        this.client,
        `https://novelup.plus/story/${novelId}?p=${page}`,
      );
      pages.push($sub);
    }

    const toc: WebNovelTocItem[] = [];
    for (const $sub of pages) {
      $sub('div.episodeList')
        .first()
        .find('div.episodeListItem')
        .each((_, li) => {
          const item = $sub(li);
          const link = item.find('a').first();
          if (link.length === 0) {
            toc.push({
              title: item.text().trim(),
              chapterId: null,
              createAt: null,
            });
            return;
          }

          const href = link.attr('href');
          toc.push({
            title: `${link.attr('data-number')?.trim() ?? ''} ${link
              .text()
              .trim()}`.trim(),
            chapterId: href ? substringAfterLast('/')(href) : null,
            createAt:
              parseJapanDateString(
                'yyyy/M/dd HH:mm',
                `20${item.find('p.publishDate').text().trim()}`,
              )?.toISOString() ?? null,
          });
        });
    }

    return {
      title,
      authors,
      type,
      keywords,
      attentions,
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
    const $ = await fetchDocument(
      this.client,
      `https://novelup.plus/story/${novelId}/${chapterId}`,
    );

    const $content = $('p#episode_content').first();
    $content.find('rp, rt').remove();
    $content.find('br').replaceWith('\n');

    const paragraphs = $content
      .text()
      .split(/\r?\n/)
      .map((line) => line.trim());

    return { paragraphs };
  }
}
