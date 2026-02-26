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
import { Setting } from '@/stores/useSettingStore';
import { download } from 'naive-ui/es/_utils';

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

const getNovel = (providerId: string, novelId: string) =>
  client.get(`novel/${providerId}/${novelId}`).json<WebNovelDto>();

const getChapter = (providerId: string, novelId: string, chapterId: string) =>
  client
    .get(`novel/${providerId}/${novelId}/chapter/${chapterId}`)
    .json<WebNovelChapterDto>();

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

  const getTranslateTask = () =>
    client.get(endpointV2, { signal }).json<WebTranslateTask>();

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
  opacityOrColor,
  type,
  title,
}: {
  providerId: string;
  novelId: string;
  mode: 'jp' | 'zh' | 'zh-jp' | 'jp-zh';
  translationsMode: 'parallel' | 'priority';
  translations: ('sakura' | 'baidu' | 'youdao' | 'gpt')[];
  type: 'epub' | 'txt';
  opacityOrColor: Setting['downloadFormat']['opacityOrColor'];
  title: string;
}) => {
  const filename = [
    mode,
    mode === 'jp'
      ? ''
      : (translationsMode === 'parallel' ? 'B' : 'Y') +
        translations.map((it) => it[0]).join(''),
    opacityOrColor === 'opacity' ? 'O' : 'C',
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
    opacityOrColor,
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

  createTranslationApi,

  createFileUrl,
};
