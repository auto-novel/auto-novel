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
  stringToAttentionEnum,
  substringAfterLast,
} from './utils';

function textOrNull(text: string): string | null {
  const normalized = text.trim();
  return normalized ? normalized : null;
}

function parseWebNovelType(typeText: string): WebNovelType {
  switch (typeText) {
    case '連載中':
      return WebNovelType.Ongoing;
    case '完結':
      return WebNovelType.Completed;
    default:
      throw new CrawlerParseError(`无法解析的小说类型： ${typeText}`);
  }
}

export class Alphapolis implements WebNovelProvider {
  readonly id = 'alphapolis';
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

  private getMetadataUrl(novelId: string): string {
    return `https://www.alphapolis.co.jp/novel/${novelId.split('-').join('/')}`;
  }

  private getEpisodeUrl(novelId: string, chapterId: string): string {
    return `${this.getMetadataUrl(novelId)}/episode/${chapterId}`;
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata> {
    const $ = await fetchDocument(this.client, this.getMetadataUrl(novelId));

    const $contentInfo = $('#sidebar').first().find('.content-info').first();
    if ($contentInfo.length === 0) {
      throw new CrawlerParseError('作品信息解析失败');
    }

    const $contentMain = $('#main').first().find('.content-main').first();
    if ($contentMain.length === 0) {
      throw new CrawlerParseError('作品主体解析失败');
    }

    const $info = $contentInfo.find('.content-statuses').first();
    if ($info.length === 0) {
      throw new CrawlerParseError('作品状态解析失败');
    }

    const $table = $contentInfo.find('table.detail').first();
    if ($table.length === 0) {
      throw new CrawlerParseError('作品详情解析失败');
    }

    const row = (label: string) =>
      $table
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

    const title = $contentMain.find('h1.title').first().text().trim();

    const authors = $contentMain
      .find('div.author a')
      .first()
      .map((_, a) => {
        const $a = $(a);
        return {
          name: $a.text().trim(),
          link: $a.attr('href') || null,
        } satisfies WebNovelAuthor;
      })
      .get();

    const typeText = textOrNull($info.find('span.complete').first().text());
    if (!typeText) {
      throw new CrawlerParseError('小说类型解析失败');
    }
    const type = parseWebNovelType(typeText);

    const attentionText = textOrNull($info.find('span.rating').first().text());
    const attention = attentionText
      ? stringToAttentionEnum(attentionText)
      : null;

    const keywords = $contentMain
      .find('.content-tags > .tag')
      .map((_, el) => $(el).text().trim())
      .get();

    const points = numExtractor(row('累計ポイント').text().trim());
    const totalCharacters = numExtractor(row('文字数').text().trim()) ?? 0;
    const introduction = $contentMain
      .find('div.abstract')
      .first()
      .text()
      .trim();

    const toc: WebNovelTocItem[] = [];
    $('div.episodes')
      .children()
      .each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('chapter-rental')) {
          toc.push({
            title: $el.find('h3').first().text().trim(),
            chapterId: null,
            createAt: null,
          });
          return;
        }

        if ($el.hasClass('rental')) {
          $el
            .find('div.rental-episode > a')
            .not('[class]')
            .each((_, child) => {
              const $item = $(child);
              const href = $item.attr('href');
              toc.push({
                title: $item.text().trim(),
                chapterId: href ? substringAfterLast('/')(href) : null,
                createAt: null,
              });
            });
          return;
        }

        if (el.tagName === 'h3') {
          const chapterTitle = $el.text().trim();
          if (chapterTitle) {
            toc.push({
              title: chapterTitle,
              chapterId: null,
              createAt: null,
            });
          }
          return;
        }

        if ($el.hasClass('episode')) {
          const episodeTitle = $el.find('span.title').first().text().trim();
          if (!episodeTitle) {
            throw new CrawlerParseError('章节标题解析失败');
          }

          const href = $el.find('a').first().attr('href');
          toc.push({
            title: episodeTitle,
            chapterId: href ? substringAfterLast('/')(href) : null,
            createAt: null,
          });
        }
      });

    return {
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

  async getChapter(
    novelId: string,
    chapterId: string,
  ): Promise<WebNovelChapter> {
    const $ = await fetchDocument(
      this.client,
      this.getEpisodeUrl(novelId, chapterId),
    );

    let $content = $('div#novelBody');
    if ($content.length === 0) {
      $content = $('div.text');
    }
    if ($content.length === 0) {
      throw new CrawlerParseError('章节内容解析失败');
    }

    $content.find('rp, rt').remove();
    const rawText = $content
      .contents()
      .toArray()
      .map((node) => {
        if (node.type === 'text') {
          return node.data ?? '';
        }
        if (node.type === 'tag') {
          return node.tagName === 'br' ? '\n' : $(node).text();
        }
        return '';
      })
      .join('');
    const paragraphs = rawText.split(/\r?\n/).map((line) => line.trimStart());

    if (paragraphs.length < 5) {
      throw new CrawlerParseError('章节内容太少，爬取频率太快导致未加载');
    }

    return { paragraphs };
  }
}
