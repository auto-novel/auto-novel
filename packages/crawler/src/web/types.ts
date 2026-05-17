export type Page<T> = {
  items: T[];
  pageNumber: number;
};

export const emptyPage = <T>() =>
  <Page<T>>{
    items: [],
    pageNumber: 0,
  };

export type WebNovelListItem = {
  novelId: string;
  title: string;
  attentions: WebNovelAttention[];
  keywords: string[];
  extra: string;
};

export enum WebNovelAttention {
  R15 = 'R15',
  R18 = 'R18',
  Cruelty = '残酷描写',
  Violence = '暴力描写',
  SexualContent = '性描写',
}

export type WebNovelAuthor = {
  name: string;
  link: string | null | undefined;
};

export enum WebNovelType {
  Ongoing = '连载中',
  Completed = '已完结',
  ShortStory = '短篇',
}

export type WebNovelTocItem = {
  title: string;
  chapterId: string | null | undefined;
  createAt: string | null | undefined;
};

export type WebNovelChapter = {
  paragraphs: string[];
};

export type WebNovelMetadata = {
  title: string;
  authors: WebNovelAuthor[];
  type: WebNovelType;
  attentions: WebNovelAttention[];
  keywords: string[];
  points: number | null | undefined;
  totalCharacters: number;
  introduction: string;
  toc: WebNovelTocItem[];
};

export interface WebNovelProvider<GetRankOptionsT = Record<string, string>> {
  readonly id: string;
  readonly version: string;

  getRank(options: GetRankOptionsT): Promise<Page<WebNovelListItem>>;
  getMetadata(novelId: string): Promise<WebNovelMetadata>;
  getChapter(novelId: string, chapterId: string): Promise<WebNovelChapter>;
}
