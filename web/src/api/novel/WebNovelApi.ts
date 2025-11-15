import type { Page } from '@/model/Page';
import type {
  TranslatorId,
  WebChapterTranslateTask,
  WebTranslateTask,
} from '@/model/Translator';
import type {
  WebNovelChapterDto,
  WebNovelDto,
  WebNovelOutlineDto,
} from '@/model/WebNovel';
import { client } from './client';
import { type RemoteNovelMetadata } from '@/domain/crawlers/types';

import { Providers } from '@auto-novel/crawler';
import ky from 'ky';

export const isProviderAvailable = (
  providerId: string,
): providerId is keyof typeof Providers => {
  return Object.keys(Providers).includes(providerId);
};

const listNovel = ({
  page,
  pageSize,
  query = '',
  provider = '',
  type = 0,
  level = 0,
  translate = 0,
  sort = 0,
}: {
  page: number;
  pageSize: number;
  query?: string;
  provider?: string;
  type?: number;
  level?: number;
  translate?: number;
  sort?: number;
}) =>
  client
    .get(`novel`, {
      searchParams: {
        page,
        pageSize,
        query,
        provider,
        type,
        level,
        translate,
        sort,
      },
    })
    .json<Page<WebNovelOutlineDto>>();

const listRank = (providerId: string, params: { [key: string]: string }) =>
  client
    .get(`novel/rank/${providerId}`, {
      searchParams: params,
      timeout: 20000,
    })
    .json<Page<WebNovelOutlineDto>>();

const getMetadataFromAddonOrNull = async (
  providerId: string,
  novelId: string,
  ignoreRateLimit = false,
): Promise<RemoteNovelMetadata | null> => {
  if (!window.Addon || !isProviderAvailable(providerId)) return null;

  type LastAccessData = Record<string, LastAccessItem>;
  type LastAccessItem = {
    time: Date;
    data: object | null;
  };

  const primaryKey = `addon-getMetadata-lastAccess`;
  const key = `${providerId}-${novelId}`;

  const empty: LastAccessItem = {
    time: new Date(0),
    data: null,
  };

  const lastAccessData: LastAccessData = (() => {
    if (ignoreRateLimit) return {};

    const _lastAccessData = localStorage.getItem(primaryKey);
    if (!_lastAccessData) {
      localStorage.setItem(primaryKey, JSON.stringify(<LastAccessData>{}));
      return {};
    }

    const lastAccessData = JSON.parse(_lastAccessData) as LastAccessData;
    return lastAccessData;
  })();

  const lastAccess = lastAccessData[key] ?? empty;

  // NOTE(kuriko): only access metadata within 1 hour
  const diffTime = new Date().getTime() - new Date(lastAccess.time).getTime();
  if (false && diffTime < 1000 * 60 * 60) {
    return null; // Use metadata from server
  }

  const providerInitFn = Providers[providerId];
  const _client = ky.create({
    fetch: window.Addon.fetch,
  });
  // NOTE(kuriko): ky version mismatch between web and addon, so use 'any' here.
  const provider = providerInitFn(_client as any);
  const metadata = await provider?.getMetadata(novelId);
  lastAccessData[key] = {
    time: new Date(),
    data: metadata,
  };
  localStorage.setItem(primaryKey, JSON.stringify(lastAccessData));
  return metadata;
};

const getNovel = async (providerId: string, novelId: string) => {
  try {
    if (window.Addon) {
      const metadata = await getMetadataFromAddonOrNull(providerId, novelId);
      if (metadata !== null) {
        const resp = await client.post(
          `novel/${providerId}/${novelId}/upload/metadata`,
          { json: metadata },
        );
        const ret = await resp.json<WebNovelDto>();
        return ret;
      }
    }
  } catch (e) {
    console.debug(`Error: ${e}, fallback to server mode`);
    throw e;
  }

  // 有任何问题，则 fallback 到直接从服务器获取。
  return client.get(`novel/${providerId}/${novelId}`).json<WebNovelDto>();
};

const uploadChapters = async (providerId: string, novelId: string) => {
  if (!window.Addon || !isProviderAvailable(providerId)) return null;
  const metadata = await getMetadataFromAddonOrNull(providerId, novelId, true);
  if (!metadata) return null;

  const providerInitFn = Providers[providerId];
  const _client = ky.create({
    timeout: false,
    fetch: window.Addon.fetch,
  });
  // NOTE(kuriko): ky version mismatch between web and addon, so use 'any' here.
  const provider = providerInitFn(_client as any);
  const futs = metadata.toc
    .filter((tocItem) => tocItem.chapterId != null)
    .map(async (tocItem) => {
      let data = null;
      try {
        data = await provider?.getChapter(novelId, tocItem.chapterId!);
      } catch (_) {
        console.error(`failed chapter: ${novelId} - ${tocItem.chapterId}`);
      }
      return [tocItem.chapterId, data];
    });

  let chapterEntries = await Promise.all(futs);
  const chapterEntriesNotNull = chapterEntries.filter(
    ([, chapter]) => chapter != null,
  );
  const chapters = Object.fromEntries(chapterEntriesNotNull);

  return client.post(`novel/${providerId}/${novelId}/upload/chapters`, {
    json: {
      metadata,
      chapters,
    },
  });
};

const getChapter = async (
  providerId: string,
  novelId: string,
  chapterId: string,
) => {
  // FIXME(kuriko):
  // 这个地方有点麻烦，按逻辑来说，章节不存在的话，应该是 server 或者 addon 主动爬取章节。
  // 但是目前 getChapter 会在 server 那边自动爬取内容，相当于 get 是有副作用的。
  // 或者 Addon 的更新只能由用户手动触发？

  // if (window.Addon) {
  //   const metadata = await getMetadataFromAddonOrNull(providerId, novelId);
  //   if (!metadata) return;

  //   const provider = Providers[providerId];
  //   const chapter = await provider?.getChapter(novelId, chapterId);
  //   if (chapter) {
  //     console.debug(`Upload Chapter from Addon: ${chapterId});`)
  //     await client.post(`novel/${providerId}/${novelId}/upload/chapters`, { json: {
  //       metadata,
  //       chapters: { chapterId: chapter!},
  //     }});
  //   }
  // }

  return client
    .get(`novel/${providerId}/${novelId}/chapter/${chapterId}`)
    .json<WebNovelChapterDto>();
};

const updateNovel = (
  providerId: string,
  novelId: string,
  json: {
    title: string;
    introduction: string;
    toc: { [key: string]: string };
    wenkuId?: string;
  },
) => client.post(`novel/${providerId}/${novelId}`, { json });

const updateGlossary = (
  providerId: string,
  novelId: string,
  json: { [key: string]: string },
) => client.put(`novel/${providerId}/${novelId}/glossary`, { json });

// Translate
const createTranslationApi = (
  providerId: string,
  novelId: string,
  translatorId: TranslatorId,
  syncFromProvider: boolean,
  signal?: AbortSignal,
) => {
  const endpointV2 = `novel/${providerId}/${novelId}/translate-v2/${translatorId}`;

  const getTranslateTask = async () => {
    // TODO(kuriko): add a trigger for uploadChapters here?
    try {
      await uploadChapters(providerId, novelId);
    } catch (e) {
      console.debug(`Error: ${e}, fallback to server mode`);
    }

    return client.get(endpointV2, { signal }).json<WebTranslateTask>();
  };

  const getChapterTranslateTask = (chapterId: string) =>
    client
      .post(`${endpointV2}/chapter-task/${chapterId}`, {
        searchParams: { sync: syncFromProvider },
        signal,
      })
      .json<WebChapterTranslateTask>();

  const updateMetadataTranslation = (json: {
    title?: string;
    introduction?: string;
    toc: { [key: string]: string };
  }) => client.post(`${endpointV2}/metadata`, { json, signal }).text();

  const updateChapterTranslation = (
    chapterId: string,
    json: {
      glossaryId?: string;
      paragraphsZh: string[];
    },
  ) =>
    client
      .post(`${endpointV2}/chapter/${chapterId}`, {
        json: { ...json, sakuraVersion: '0.9' },
        signal,
      })
      .json<{ jp: number; zh: number }>();

  return {
    getTranslateTask,
    getChapterTranslateTask,
    updateMetadataTranslation,
    updateChapterTranslation,
  };
};

// File
const createFileUrl = ({
  providerId,
  novelId,
  mode,
  translationsMode,
  translations,
  type,
  title,
}: {
  providerId: string;
  novelId: string;
  mode: 'jp' | 'zh' | 'zh-jp' | 'jp-zh';
  translationsMode: 'parallel' | 'priority';
  translations: ('sakura' | 'baidu' | 'youdao' | 'gpt')[];
  type: 'epub' | 'txt';
  title: string;
}) => {
  const filename = [
    mode,
    mode === 'jp'
      ? ''
      : (translationsMode === 'parallel' ? 'B' : 'Y') +
        translations.map((it) => it[0]).join(''),
    title.replace(/[\/|\\:*?"<>]/g, ''),
    type,
  ]
    .filter(Boolean)
    .join('.');

  const params = new URLSearchParams({
    mode,
    translationsMode,
    type,
    filename,
  });
  translations.forEach((it) => params.append('translations', it));

  const url = `/api/novel/${providerId}/${novelId}/file?${params}`;
  return { url, filename };
};

export const WebNovelApi = {
  listNovel,
  listRank,

  getNovel,
  getChapter,

  updateNovel,
  updateGlossary,

  uploadChapters,

  createTranslationApi,

  createFileUrl,
};
