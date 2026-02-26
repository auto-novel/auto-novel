import {
  NovelAccessDeniedException,
  type TocItem,
  WebNovelAttention,
  type Page,
  type RemoteChapter,
  type RemoteNovelListItem,
  type RemoteNovelMetadata,
  type WebNovelAuthor,
  type WebNovelProvider,
  WebNovelType,
} from './types';

export class Pixiv implements WebNovelProvider {
  static readonly id = 'pixiv';
  // Pixiv Web Crawler Version
  static readonly version = '1.0.0';

  async getRank(
    options: Record<string, string>,
  ): Promise<Page<RemoteNovelListItem>> {
    return {
      items: [],
      hasNext: false,
    };
  }

  async getMetadata(novelId: string): Promise<RemoteNovelMetadata | null> {
    const addon = window.Addon;
    if (!addon) {
      return null;
    }

    if (novelId.startsWith('s')) {
      const chapterId = novelId.substring(1);
      const url = `https://www.pixiv.net/ajax/novel/${chapterId}`;
      const resp = await addon.fetch(url);
      const data = await resp.json();
      console.debug(data);
      const obj = data.body;

      const seriesData = obj.seriesNavData;
      if (seriesData != null) {
        const targetNovelId = seriesData.seriesId;
        throw new Error(
          `小说ID不合适，应当使用：/${Pixiv.id}/${targetNovelId}`,
        );
      }

      const title = obj.title;
      const author: WebNovelAuthor = {
        name: obj.userName,
        link: `https://www.pixiv.net/users/${obj.userId}`,
      };

      const keywords = obj.tags?.tags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?.map((tagItem: any) => tagItem?.tag)
        .filter((tag: string) => tag != 'R-18');

      const attentions = obj.xRestrict == 0 ? [] : [WebNovelAttention.R18];
      const totalCharacters = obj.characterCount;
      const introduction =
        obj.description?.replace(/<br ?\/>/g, '\n') || obj.caption || '';
      const createAt = obj.createDate;

      return {
        title,
        authors: [author],
        type: WebNovelType.ShortStory,
        keywords,
        attentions,
        points: null,
        totalCharacters,
        introduction,
        toc: [
          {
            title: '无名',
            chapterId: chapterId,
            createAt,
          },
        ],
      };
    } else {
      const resp = await addon.fetch(
        `https://www.pixiv.net/ajax/novel/series/${novelId}`,
      );
      const data = await resp.json();
      console.debug(data);
      const obj = data.body;

      const title = obj.title;
      const author: WebNovelAuthor = {
        name: obj.userName,
        link: `https://www.pixiv.net/users/${obj.userId}`,
      };
      const attentions = obj.xRestrict == 0 ? [] : [WebNovelAttention.R18];
      const totalCharacters = obj.publishedTotalCharacterCount;
      const introduction =
        obj.description?.replace(/<br ?\/>/g, '\n') || obj.caption || '';

      const toc: TocItem[] = [];
      const keywords = obj.tags ?? [];

      if (keywords.length === 0) {
        const url = `https://www.pixiv.net/ajax/novel/series_content/${novelId}?limit=30&last_order=0&order_by=asc`;
        const resp = await addon.fetch(url);
        const data = await resp.json();
        const obj = data.body;
        console.debug(obj);
        const arr: [] = obj.page?.seriesContents ?? [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        arr.forEach((seriesContent: any) => {
          if (seriesContent.title == undefined)
            throw NovelAccessDeniedException();
          keywords.push(...(seriesContent.tags ?? []));
          toc.push({
            title: seriesContent.title,
            chapterId: seriesContent.id,
            createAt: seriesContent.createDate,
          });
        });

        if (arr.length < 30) {
          return {
            title,
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

      // aka, toc.clear()
      toc.length = 0;

      const url2 = `https://www.pixiv.net/ajax/novel/series/${novelId}/content_titles`;
      const resp2 = await addon.fetch(url2);
      const data2 = await resp2.json();
      console.debug(data2);
      const arr2: [] = data2.body ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      arr2.forEach((item: any) => {
        if (item.available) {
          toc.push({
            title: item.title,
            chapterId: item.id,
            createAt: null,
          });
        } else {
          throw NovelAccessDeniedException();
        }
      });

      return {
        title,
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
    const url = embeddedImages[id]?.urls?.original;
    return url ?? null;
  }

  private readonly imagePattern2 = /\[pixivimage:(\d+)\]/;
  private async parseImageUrlPattern2(
    line: string,
    chapterId: string,
  ): Promise<string | null> {
    const addon = window.Addon;
    if (!addon) {
      return null;
    }
    const match = this.imagePattern2.exec(line);
    const id = match?.[1];
    if (!id) {
      return null;
    }
    const fetchUrl = `https://www.pixiv.net/ajax/novel/${chapterId}/insert_illusts?id%5B%5D=${id}`;
    const response = await addon.fetch(fetchUrl);
    const data = await response.json();
    console.debug(data);
    const url = data?.body?.[id]?.illust?.images?.original;
    return url ?? null;
  }

  private readonly rubyPattern = /\[\[rb:([^>]+) > ([^\]]+)\]\]/g;

  // NOTE(kuriko): charpter 拼写错误，先修正过来, merge 的时候确认后删除。
  // private readonly chapterPattern = /\[charpter:([^\]]+)\]/g;
  private readonly chapterPattern = /\[chapter:([^\]]+)\]/g;
  private cleanFormat(line: string): string {
    return line
      .replace(this.rubyPattern, '$1')
      .replace(this.chapterPattern, '章节：$1')
      .replaceAll('[newpage]', '');
  }

  async getChapter(novelId: string, chapterId: string): Promise<RemoteChapter> {
    const addon = window.Addon;
    if (!addon) {
      throw new Error('Addon not found');
    }
    const url = `https://www.pixiv.net/ajax/novel/${chapterId}`;
    const resp = await addon.fetch(url);
    const data = await resp.json();
    console.debug(data);
    const body = data.body;

    const embeddedImages = body.textEmbeddedImages ?? null;
    const content: string = body.content;

    const promises = content.split('\n').map(async (line: string) => {
      const imageUrl =
        this.parseImageUrlPattern1(line, embeddedImages) ??
        (await this.parseImageUrlPattern2(line, chapterId));

      if (imageUrl == null) {
        return this.cleanFormat(line);
      } else {
        return `<图片>${imageUrl}`;
      }
    });
    const paragraphs = await Promise.all(promises);

    return { paragraphs };
  }
}
