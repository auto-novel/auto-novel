import { isEqual } from 'lodash-es';

import { WebNovelApi } from '@/api';
import type { WebNovelChapter, WebNovelMetadata } from '@/external';
import { WebNovelCrawlerApi } from '@/external';
import type { WebNovelDto } from '@/model/WebNovel';
import { WebNovelRepo } from '@/repos';
import { ServerErrorMsg } from '@/api/serverError';

const toMutationBody = (metadata: WebNovelMetadata) => ({
  title: metadata.title,
  authors: metadata.authors.map((author) => ({
    name: author.name,
    link: author.link ?? null,
  })),
  type: metadata.type,
  attentions: metadata.attentions,
  keywords: metadata.keywords,
  points: metadata.points ?? null,
  totalCharacters: metadata.totalCharacters,
  introduction: metadata.introduction,
  toc: metadata.toc.map((item) => ({
    title: item.title,
    chapterId: item.chapterId ?? null,
    createAt: item.createAt ?? null,
  })),
});

const toCurrentMutationBody = (novel: WebNovelDto) => ({
  title: novel.titleJp,
  authors: novel.authors.map((author) => ({
    name: author.name,
    link: author.link ?? null,
  })),
  type: novel.type as WebNovelMetadata['type'],
  attentions: novel.attentions as WebNovelMetadata['attentions'],
  keywords: novel.keywords,
  points: novel.points ?? null,
  totalCharacters: novel.totalCharacters ?? 0,
  introduction: novel.introductionJp,
  toc: novel.toc.map((item) => ({
    title: item.titleJp,
    chapterId: item.chapterId ?? null,
    createAt:
      item.createAt != null
        ? new Date(item.createAt * 1000).toISOString()
        : null,
  })),
});

const updateWebNovel = async (
  providerId: string,
  novelId: string,
  current?: WebNovelDto,
) => {
  const metadata = await WebNovelCrawlerApi.getMetadata(providerId, novelId);
  const body = toMutationBody(metadata);
  current ??= await WebNovelApi.getNovel(providerId, novelId);
  if (body.toc.length < current.toc.length) {
    throw new Error('目录变短，放弃更新，请手动打开源站确保你有办法访问');
  }
  if (isEqual(body, toCurrentMutationBody(current))) {
    throw new Error('没有必要更新');
  }

  await WebNovelRepo.updateNovel(providerId, novelId, body);
};

const updateWebNovelChapter = async (
  providerId: string,
  novelId: string,
  chapterId: string,
  force: boolean,
) => {
  const chapter = await WebNovelCrawlerApi.getChapter(
    providerId,
    novelId,
    chapterId,
  );
  const body = toChapterMutationBody(chapter);

  if (!force) {
    await WebNovelRepo.createChapter(providerId, novelId, chapterId, body);
    return 'updated' as const;
  }

  try {
    await WebNovelRepo.updateChapter(providerId, novelId, chapterId, body);
    return 'updated' as const;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes('404') ||
      message.includes(ServerErrorMsg.ChapterNotFound)
    ) {
      await WebNovelRepo.createChapter(providerId, novelId, chapterId, body);
      return 'created' as const;
    }
    throw e;
  }
};

const toChapterMutationBody = (chapter: WebNovelChapter) => ({
  paragraphs: chapter.paragraphs,
});

export const CrawlerService = {
  updateWebNovel,
  updateWebNovelChapter,
};
