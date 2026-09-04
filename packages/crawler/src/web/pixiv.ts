import * as cheerio from 'cheerio';
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
import {
  CrawlerAuthError,
  CrawlerHttpError,
  CrawlerInputError,
  CrawlerParseError,
} from '@/errors';

function parsePixivAttention(xRestrict: number): WebNovelAttention[] {
  return xRestrict === 0 ? [] : [WebNovelAttention.R18];
}

function normalizePixivDescription(
  description: string | undefined,
  fallback = '',
): string {
  return description?.replace(/<br ?\/>/g, '\n') || fallback;
}

export type PixivOptions = {
  precheckViewingSettings?: boolean;
};

export class Pixiv implements WebNovelProvider {
  readonly id = 'pixiv';
  readonly version = '1.0.0';

  client: KyInstance;
  private readonly precheckViewingSettings: boolean;

  private static readonly VIEWING_SETTINGS_TTL = 60 * 60 * 1000;
  private viewingSettingsCache: {
    expiresAt: number;
    promise: Promise<void>;
  } | null = null;

  constructor(client: KyInstance, options: PixivOptions = {}) {
    this.client = client;
    this.precheckViewingSettings = options.precheckViewingSettings ?? true;
  }

  private async assertViewingSettingsEnabled(): Promise<void> {
    const url = 'https://www.pixiv.net/settings/viewing';
    const response = await this.client.get(url, { throwHttpErrors: false });
    const html = await response.text();

    if (!response.ok) {
      throw new CrawlerHttpError(
        `Pixiv 设置页请求失败：${response.status} ${response.statusText} (${url})`,
        response.status,
        url,
      );
    }

    const $ = cheerio.load(html);
    const getChecked = (name: string): boolean | undefined => {
      const input = $(`input[name="${name}"]`).first();
      return input.length === 0 ? undefined : input.is(':checked');
    };

    const isSensitiveViewEnabled = getChecked('sensitive_view_setting');
    const isR18Enabled = getChecked('r18');
    const isR18GEnabled = getChecked('r18g');

    if (
      isSensitiveViewEnabled === undefined ||
      isR18Enabled === undefined ||
      isR18GEnabled === undefined
    ) {
      throw new CrawlerAuthError('Pixiv 账号未登录');
    }

    if (!(isSensitiveViewEnabled && isR18Enabled && isR18GEnabled)) {
      throw new CrawlerAuthError(
        'Pixiv 账号未开启敏感内容、R18 或 R18G 查看权限',
      );
    }
  }

  private async ensureViewingSettings(): Promise<void> {
    const now = Date.now();
    if (
      this.viewingSettingsCache &&
      this.viewingSettingsCache.expiresAt > now
    ) {
      await this.viewingSettingsCache.promise;
      return;
    }

    const promise = this.assertViewingSettingsEnabled().catch((error) => {
      if (this.viewingSettingsCache?.promise === promise) {
        this.viewingSettingsCache = null;
      }
      throw error;
    });

    this.viewingSettingsCache = {
      expiresAt: now + Pixiv.VIEWING_SETTINGS_TTL,
      promise,
    };

    await promise;
  }

  private async fetchPixivBody<T>(url: string): Promise<T> {
    const response = await this.client.get(url, { throwHttpErrors: false });
    let data: { error?: boolean; message?: string; body?: T };
    try {
      data = await response.json();
    } catch {
      throw new CrawlerHttpError(
        `Pixiv API 返回了无效响应：${response.status} ${response.statusText} (${url})`,
        response.status,
        url,
      );
    }

    if (!response.ok) {
      throw new CrawlerHttpError(
        `Pixiv API 请求失败：${response.status} ${response.statusText} (${url})`,
        response.status,
        url,
      );
    }

    if (data.error || data.body == null) {
      throw new CrawlerAuthError(
        data.message || '当前账号无法获取该 Pixiv 小说资源',
      );
    }

    return data.body;
  }

  private async precheckViewingSettingsIfNeeded(): Promise<void> {
    if (this.precheckViewingSettings) {
      await this.ensureViewingSettings();
    }
  }

  async getRank(
    _options: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return emptyPage();
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata> {
    await this.precheckViewingSettingsIfNeeded();

    if (novelId.startsWith('s')) {
      const chapterId = novelId.substring(1);
      const obj: any = await this.fetchPixivBody(
        `https://www.pixiv.net/ajax/novel/${chapterId}`,
      );

      const seriesData = obj.seriesNavData;
      if (seriesData != null) {
        const targetNovelId = seriesData.seriesId;
        throw new CrawlerInputError(
          `小说ID不合适，应当使用：/${this.id}/${targetNovelId}`,
        );
      }

      const author: WebNovelAuthor = {
        name: obj.userName,
        link: `https://www.pixiv.net/users/${obj.userId}`,
      };

      const keywords =
        obj.tags?.tags
          ?.map((tagItem: any) => tagItem?.tag)
          .filter((tag: string) => tag !== 'R-18') ?? [];

      return {
        title: obj.title,
        authors: [author],
        type: WebNovelType.ShortStory,
        keywords,
        attentions: parsePixivAttention(obj.xRestrict),
        points: null,
        totalCharacters: obj.characterCount,
        introduction: normalizePixivDescription(
          obj.description,
          obj.caption || '',
        ),
        toc: [
          {
            title: '无名',
            chapterId,
            createAt: obj.createDate,
          },
        ],
      };
    }

    const obj: any = await this.fetchPixivBody(
      `https://www.pixiv.net/ajax/novel/series/${novelId}`,
    );

    const author: WebNovelAuthor = {
      name: obj.userName,
      link: `https://www.pixiv.net/users/${obj.userId}`,
    };

    const attentions = parsePixivAttention(obj.xRestrict);
    const totalCharacters = obj.publishedTotalCharacterCount;
    const introduction = normalizePixivDescription(
      obj.description,
      obj.caption || '',
    );
    const toc: WebNovelTocItem[] = [];
    const keywords = Array.isArray(obj.tags) ? [...obj.tags] : [];

    if (keywords.length === 0) {
      const contentBody: any = await this.fetchPixivBody(
        `https://www.pixiv.net/ajax/novel/series_content/${novelId}?limit=30&last_order=0&order_by=asc`,
      );
      const contents = contentBody?.page?.seriesContents ?? [];

      contents.forEach((seriesContent: any) => {
        if (seriesContent.title == undefined) {
          throw new CrawlerAuthError('当前账号无法获取该小说资源');
        }

        keywords.push(...(seriesContent.tags ?? []));
        toc.push({
          title: seriesContent.title,
          chapterId: seriesContent.id,
          createAt: seriesContent.createDate,
        });
      });

      if (contents.length < 30) {
        return {
          title: obj.title,
          authors: [author],
          type: WebNovelType.Ongoing,
          keywords,
          attentions,
          points: null,
          totalCharacters,
          introduction,
          toc,
        };
      }
    }

    toc.length = 0;

    const items: any[] = await this.fetchPixivBody(
      `https://www.pixiv.net/ajax/novel/series/${novelId}/content_titles`,
    );

    items.forEach((item: any) => {
      if (!item.available) {
        throw new CrawlerAuthError('当前账号无法获取该小说资源');
      }

      toc.push({
        title: item.title,
        chapterId: item.id,
        createAt: null,
      });
    });

    return {
      title: obj.title,
      authors: [author],
      type: WebNovelType.Ongoing,
      keywords,
      attentions,
      points: null,
      totalCharacters,
      introduction,
      toc,
    };
  }

  private readonly imagePattern1 = /\[uploadedimage:(\d+)\]/;

  private parseImageUrlPattern1(
    line: string,
    embeddedImages: any,
  ): string | null {
    if (!embeddedImages) {
      return null;
    }

    const match = this.imagePattern1.exec(line);
    const id = match ? match[1] : null;
    if (!id) {
      return null;
    }

    return embeddedImages[id]?.urls?.original ?? null;
  }

  private readonly imagePattern2 = /\[pixivimage:(\d+)\]/;

  private async parseImageUrlPattern2(
    line: string,
    chapterId: string,
  ): Promise<string | null> {
    const match = this.imagePattern2.exec(line);
    const id = match?.[1];
    if (!id) {
      return null;
    }

    const body: any = await this.fetchPixivBody(
      `https://www.pixiv.net/ajax/novel/${chapterId}/insert_illusts?id%5B%5D=${id}`,
    );
    return body?.[id]?.illust?.images?.original ?? null;
  }

  private readonly rubyPattern = /\[\[rb:([^>]+) > ([^\]]+)\]\]/g;
  private readonly chapterPattern = /\[chapter:([^\]]+)\]/g;

  private cleanFormat(line: string): string {
    return line
      .replace(this.rubyPattern, '$1')
      .replace(this.chapterPattern, '章节：$1')
      .replaceAll('[newpage]', '');
  }

  async getChapter(
    _novelId: string,
    chapterId: string,
  ): Promise<WebNovelChapter> {
    await this.precheckViewingSettingsIfNeeded();

    const body: any = await this.fetchPixivBody(
      `https://www.pixiv.net/ajax/novel/${chapterId}`,
    );

    const embeddedImages = body.textEmbeddedImages ?? null;
    const content: string = body.content;

    const paragraphs = await Promise.all(
      content.split('\n').map(async (line: string) => {
        const imageUrl =
          this.parseImageUrlPattern1(line, embeddedImages) ??
          (await this.parseImageUrlPattern2(line, chapterId));

        return imageUrl == null ? this.cleanFormat(line) : `<图片>${imageUrl}`;
      }),
    );
    if (paragraphs.length <= 1) {
      console.error('Pixiv chapter data:', body);
      throw new CrawlerParseError('Pixiv 章节解析结果行数异常');
    }

    return { paragraphs };
  }
}
