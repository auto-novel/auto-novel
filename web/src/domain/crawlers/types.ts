export interface WebNovelProvider {
  getRank(
    options: Record<string, string>,
  ): Promise<Page<RemoteNovelListItem> | null>;
  getMetadata(novelId: string): Promise<RemoteNovelMetadata | null>;
  getChapter(novelId: string, chapterId: string): Promise<RemoteChapter | null>;
}

export type Page<T> = {
  items: T[];
  hasNext: boolean;
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
) => new Error(`当前账号无法获取该小说资源: /${providerId}/${targetNovelId}`);
