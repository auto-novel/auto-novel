import { WebNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { useLocalVolumeStore } from '@/stores';
import type { Result } from '@/util/result';
import { Ok, runCatching } from '@/util/result';

export interface ReaderChapter {
  chapterId: string;
  titleJp: string;
  titleZh?: string;
  prevId?: string;
  nextId?: string;
  paragraphs: string[];
  baiduParagraphs?: string[];
  youdaoParagraphs?: string[];
  gptParagraphs?: string[];
  sakuraParagraphs?: string[];
  murasakiParagraphs?: string[];
}

interface ReaderChapterState {
  value?: ReaderChapter;
  promise: Promise<Result<ReaderChapter>>;
}

type ReaderStore = {
  chapters: Map<string, ReaderChapterState>;
};

export const useReaderStore = (gnid: GenericNovelId) => {
  return defineStore(`Reader/${GenericNovelId.toString(gnid)}`, {
    state: () =>
      <ReaderStore>{
        chapters: new Map<string, ReaderChapterState>(),
      },
    actions: {
      loadChapter(
        chapterId: string,
      ):
        | { type: 'async'; promiseOrValue: Promise<Result<ReaderChapter>> }
        | { type: 'sync'; promiseOrValue: Result<ReaderChapter> } {
        const state = this.chapters.get(chapterId);
        if (state === undefined) {
          const promise = runCatching(getChapter(gnid, chapterId));
          const stateNew: ReaderChapterState = { promise };
          this.chapters.set(chapterId, stateNew);
          return {
            type: 'async',
            promiseOrValue: promise.then((result) => {
              if (result.ok) {
                stateNew.value = result.value;
              } else {
                this.chapters.delete(chapterId);
              }
              return result;
            }),
          };
        } else if (state.value === undefined) {
          return { type: 'async', promiseOrValue: state.promise };
        } else {
          return { type: 'sync', promiseOrValue: Ok(state.value) };
        }
      },

      preloadChapter(chapterId: string) {
        // 在阅读器缓存章节大于1时，才进行预加载
        if (this.chapters.size > 1) {
          this.loadChapter(chapterId);
        }
      },
    },
  })();
};

const getChapter = async (
  gnid: GenericNovelId,
  chapterId: string,
): Promise<ReaderChapter> => {
  if (gnid.type === 'web') {
    const res = await WebNovelApi.getChapter(
      gnid.providerId,
      gnid.novelId,
      chapterId,
    );
    return { ...res, chapterId };
  } else if (gnid.type === 'wenku') {
    throw '不支持文库';
  } else {
    const repo = await useLocalVolumeStore();

    const volumeId = gnid.volumeId;
    const volume = await repo.getVolume(volumeId);
    if (volume === undefined) throw Error('小说不存在');

    const chapter = await repo.getChapter(volumeId, chapterId);
    if (chapter === undefined) throw Error('章节不存在');

    const currIndex = volume.toc.findIndex((it) => it.chapterId == chapterId);
    return <ReaderChapter>{
      chapterId,
      titleJp: `${volumeId} - ${chapterId}`,
      titleZh: undefined,
      prevId: volume.toc[currIndex - 1]?.chapterId,
      nextId: volume.toc[currIndex + 1]?.chapterId,
      paragraphs: chapter.paragraphs,
      baiduParagraphs: chapter.baidu?.paragraphs,
      youdaoParagraphs: chapter.youdao?.paragraphs,
      gptParagraphs: chapter.gpt?.paragraphs,
      sakuraParagraphs: chapter.sakura?.paragraphs,
      murasakiParagraphs: chapter.murasaki?.paragraphs,
    };
  }
};
