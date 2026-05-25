import type { KyInstance } from 'ky';
import * as cheerio from 'cheerio';

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
import { CrawlerHttpError, CrawlerParseError } from '@/errors';
import {
  assertNoAWSChallenge,
  assertNoCFChallenge,
  fetchDocument,
  numExtractor,
  parseJapanDateString,
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

type AlphapolisCoverData = {
  chapterEpisodes?: Array<{
    title?: unknown;
    episodes?: Array<{
      episodeNo?: unknown;
      url?: unknown;
      mainTitle?: unknown;
      upTime?: unknown;
    }>;
  }>;
};

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

  private parseCreateAt(dateText: string, context: string): string {
    const createAt = parseJapanDateString(
      'yyyy.MM.dd HH:mm',
      dateText,
    )?.toISOString();
    if (!createAt) {
      throw new CrawlerParseError(
        `目录解析失败：${context}发布时间格式异常：${dateText}`,
      );
    }
    return createAt;
  }

  private parseTocFromCoverData(data: string): WebNovelTocItem[] {
    if (!data) {
      throw new CrawlerParseError('目录解析失败：未找到 app-cover-data');
    }

    let parsed: AlphapolisCoverData;
    try {
      parsed = JSON.parse(data) as AlphapolisCoverData;
    } catch {
      throw new CrawlerParseError('目录解析失败：app-cover-data JSON 解析异常');
    }

    if (
      !Array.isArray(parsed.chapterEpisodes) ||
      parsed.chapterEpisodes.length === 0
    ) {
      throw new CrawlerParseError('目录解析失败：chapterEpisodes 为空');
    }

    const toc: WebNovelTocItem[] = [];
    for (const [chapterIndex, chapter] of parsed.chapterEpisodes.entries()) {
      const chapterTitle =
        typeof chapter.title === 'string' ? textOrNull(chapter.title) : null;
      if (!chapterTitle) {
        throw new CrawlerParseError(
          `目录解析失败：第 ${chapterIndex + 1} 个章节标题为空`,
        );
      }
      if (!Array.isArray(chapter.episodes) || chapter.episodes.length === 0) {
        throw new CrawlerParseError(
          `目录解析失败：章节「${chapterTitle}」的分集为空`,
        );
      }

      const firstEpisodeCreateAt =
        typeof chapter.episodes[0]?.upTime === 'string'
          ? textOrNull(chapter.episodes[0].upTime)
          : null;
      if (!firstEpisodeCreateAt) {
        throw new CrawlerParseError(
          `目录解析失败：章节「${chapterTitle}」缺少首话发布时间`,
        );
      }

      toc.push({
        title: chapterTitle,
        chapterId: null,
        createAt: this.parseCreateAt(
          firstEpisodeCreateAt,
          `章节「${chapterTitle}」首话`,
        ),
      });

      for (const [episodeIndex, episode] of chapter.episodes.entries()) {
        const episodeTitle =
          typeof episode.mainTitle === 'string'
            ? textOrNull(episode.mainTitle)
            : null;
        if (!episodeTitle) {
          throw new CrawlerParseError(
            `目录解析失败：章节「${chapterTitle}」第 ${episodeIndex + 1} 话标题为空`,
          );
        }

        const createAt =
          typeof episode.upTime === 'string'
            ? textOrNull(episode.upTime)
            : null;
        if (!createAt) {
          throw new CrawlerParseError(
            `目录解析失败：章节「${chapterTitle}」第 ${episodeIndex + 1} 话发布时间为空`,
          );
        }
        const parsedCreateAt = this.parseCreateAt(
          createAt,
          `章节「${chapterTitle}」第 ${episodeIndex + 1} 话`,
        );

        let chapterId: string | null = null;
        if (typeof episode.url === 'string' && episode.url) {
          chapterId = textOrNull(substringAfterLast('/')(episode.url));
        }
        if (
          !chapterId &&
          episode.episodeNo !== null &&
          episode.episodeNo !== undefined
        ) {
          chapterId = textOrNull(String(episode.episodeNo));
        }
        if (!chapterId) {
          throw new CrawlerParseError(
            `目录解析失败：章节「${chapterTitle}」第 ${episodeIndex + 1} 话 chapterId 为空`,
          );
        }

        toc.push({
          title: episodeTitle,
          chapterId,
          createAt: parsedCreateAt,
        });
      }
    }

    return toc;
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

    const toc = this.parseTocFromCoverData(
      $('#app-cover-data').first().text().trim(),
    );

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
    let worker = async () => {
      let $ = await fetchDocument(
        this.client,
        this.getEpisodeUrl(novelId, chapterId),
      );

      try {
        // 对于第一次遇到，等待 5s 旧的 tab 关闭后重试。
        assertNoAWSChallenge($.html() || '');
      } catch (e) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        $ = await fetchDocument(
          this.client,
          this.getEpisodeUrl(novelId, chapterId),
        );
      }
      assertNoAWSChallenge($.html() || '');

      let $content = $('div#novelBody');
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
      return {
        content: $content.html(),
        paragraphs,
      };
    };

    let { content, paragraphs } = await worker();

    if (content?.includes('LoadingEpisode')) {
      // 章节内容未加载，稍等一下
      await new Promise((resolve) => setTimeout(resolve, 1000));
      ({ content, paragraphs } = await worker());
    }

    if (paragraphs.length < 5) {
      throw new CrawlerParseError('章节内容太少，爬取频率太快导致未加载');
    }

    return { paragraphs };
  }
}
