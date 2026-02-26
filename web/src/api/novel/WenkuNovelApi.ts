import type { Page } from '@/model/Page';
import type {
  TranslatorId,
  WenkuChapterTranslateTask,
  WenkuTranslateTask,
} from '@/model/Translator';
import type {
  WenkuNovelDto,
  WenkuNovelOutlineDto,
  WenkuVolumeDto,
} from '@/model/WenkuNovel';
import { client, uploadFile } from './client';

const listNovel = ({
  page,
  pageSize,
  query = '',
  level = 0,
}: {
  page: number;
  pageSize: number;
  query?: string;
  level?: number;
}) =>
  client
    .get(`wenku`, { searchParams: { page, pageSize, query, level } })
    .json<Page<WenkuNovelOutlineDto>>();

const getNovel = (novelId: string) =>
  client.get(`wenku/${novelId}`).json<WenkuNovelDto>();

interface WenkuNovelCreateBody {
  title: string;
  titleZh: string;
  cover?: string;
  authors: string[];
  artists: string[];
  level: string;
  introduction: string;
  keywords: string[];
  volumes: WenkuVolumeDto[];
}

const createNovel = (json: WenkuNovelCreateBody) =>
  client.post(`wenku`, { json }).text();

const updateNovel = (id: string, json: WenkuNovelCreateBody) =>
  client.put(`wenku/${id}`, { json });

const updateGlossary = (id: string, json: { [key: string]: string }) =>
  client.put(`wenku/${id}/glossary`, { json });

const createVolume = (
  novelId: string,
  volumeId: string,
  type: 'jp' | 'zh',
  file: File,
  onProgress: (p: number) => void,
) =>
  uploadFile(
    `/api/wenku/${novelId}/volume/${encodeURIComponent(volumeId)}`,
    type,
    file,
    onProgress,
  );

const deleteVolume = (novelId: string, volumeId: string) =>
  client.delete(`wenku/${novelId}/volume/${encodeURIComponent(volumeId)}`);

const linkWeb = (novelId: string, json: { webIds: string[] }) =>
  client.put(`wenku/${novelId}/link-web`, { json });

//Translate
const createTranslationApi = (
  novelId: string,
  volumeId: string,
  translatorId: TranslatorId,
  signal?: AbortSignal,
) => {
  const endpointV2 = `wenku/${novelId}/translate-v2/${translatorId}/${encodeURIComponent(
    volumeId,
  )}`;

  const getTranslateTask = () =>
    client.get(endpointV2, { signal }).json<WenkuTranslateTask>();

  const getChapterTranslateTask = (chapterId: string) =>
    client
      .get(`${endpointV2}/chapter-task/${chapterId}`, { signal })
      .json<WenkuChapterTranslateTask>();

  const updateChapterTranslation = (
    chapterId: string,
    json: { glossaryId: string | undefined; paragraphsZh: string[] },
  ) =>
    client
      .post(`${endpointV2}/chapter/${chapterId}`, {
        json: { ...json, sakuraVersion: '0.9' },
        signal,
      })
      .json<number>();

  return {
    getTranslateTask,
    getChapterTranslateTask,
    updateChapterTranslation,
  };
};

// File
const createFileUrl = ({
  novelId,
  volumeId,
  mode,
  translationsMode,
  translations,
}: {
  novelId: string;
  volumeId: string;
  mode: 'zh' | 'zh-jp' | 'jp-zh';
  translationsMode: 'parallel' | 'priority';
  translations: ('sakura' | 'baidu' | 'youdao' | 'gpt')[];
}) => {
  const filename = [
    mode,
    (translationsMode === 'parallel' ? 'B' : 'Y') +
      translations.map((it) => it[0]).join(''),
    volumeId,
  ].join('.');

  const params = new URLSearchParams({
    mode,
    translationsMode,
    filename,
  });
  translations.forEach((it) => params.append('translations', it));
  const url = `/api/wenku/${novelId}/file/${encodeURIComponent(
    volumeId,
  )}?${params}`;
  return { url, filename };
};

export const WenkuNovelApi = {
  listNovel,
  //
  getNovel,
  //
  createNovel,
  updateNovel,
  updateGlossary,
  createVolume,
  deleteVolume,
  linkWeb,
  //
  createTranslationApi,
  //
  createFileUrl,
};
