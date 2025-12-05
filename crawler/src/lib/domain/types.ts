import { KyInstance } from 'ky';
import z from 'zod';

export type FetchType = (
  input: URL | string | RequestLike,
  requestInit?: any,
) => Promise<ResponseLike>;

export interface RequestLike {
  url: string;
  method: string;
  headers?: [string, string][];
  body?: string;
  mode?: RequestMode;
  credentials: RequestCredentials;
  cache: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  integrity?: string;
}

export type ResponseLike = {
  body: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: [string, string][];
  redirected: boolean;
  url: string;
  json: () => Promise<any>;
  text: () => Promise<any>;
};

export interface WebNovelProvider<GetRankOptionsT = Record<string, string>> {
  readonly id: string;
  readonly version: string;

  client: KyInstance;

  getRank(options: GetRankOptionsT): Promise<Page<RemoteNovelListItem> | null>;
  getMetadata(novelId: string): Promise<RemoteNovelMetadata | null>;
  getChapter(novelId: string, chapterId: string): Promise<RemoteChapter | null>;
}

export type Page<T> = {
  items: T[];
  pageNumber: number;
};

export const emptyPage = <T>() =>
  <Page<T>>{
    items: [],
    pageNumber: 0,
  };

export type RemoteNovelListItem = {
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
  link: string | null;
};

export enum WebNovelType {
  Ongoing = '连载中',
  Completed = '已完结',
  ShortStory = '短篇',
}

export type TocItem = {
  title: string;
  chapterId: string | null;
  createAt: string | null;
};

export type RemoteChapter = {
  paragraphs: string[];
};

export type RemoteNovelMetadata = {
  title: string;
  authors: WebNovelAuthor[];
  type: WebNovelType;
  attentions: WebNovelAttention[];
  keywords: string[];
  points: number | null;
  totalCharacters: number;
  introduction: string;
  toc: TocItem[];
};

// Errors
export const NovelRateLimitedException = () => new Error('源站获取频率太快');
export const NovelAccessDeniedException = () =>
  new Error('当前账号无法获取该小说资源');
export const NovelIdShouldBeReplacedException = (
  providerId: string,
  targetNovelId: string,
) => new Error('当前账号无法获取该小说资源');
