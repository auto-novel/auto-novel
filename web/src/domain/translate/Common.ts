import { MD5 } from 'crypto-es/lib/md5';

import { TranslationCacheRepo } from '@/repos';
import type { Glossary } from '@/model/Glossary';
import type { TranslatorId } from '@/model/Translator';

export type Segmentor = (
  textJp: string[],
  textZh?: string[],
) => [string[], string[]?][];

export type Logger = (message: string, detail?: string[]) => void;

export type SegmentContext = {
  glossary: Glossary;
  /** 最近最多 500 字符的前文原文，不包含译文。 */
  previousSource?: string;
  signal?: AbortSignal;
};

export interface SegmentTranslator {
  id: TranslatorId;
  segmentor: Segmentor;
  translate: (seg: string[], context: SegmentContext) => Promise<string[]>;
  log: (message: string, detail?: string[]) => void;
}

export const createLengthSegmentor = (
  maxLength: number,
  maxLine?: number,
): Segmentor => {
  maxLine = maxLine ?? 65536;

  return (textJp: string[], textZh?: string[]) => {
    type Seg = [string[], string[]?];
    const segs: Seg[] = [];
    let segJp: string[] = [];
    let segZh: string[] = [];
    let segSize = 0;

    for (let i = 0; i < textJp.length; i++) {
      const lineJp = textJp[i];
      const lineJpSize = lineJp.length;

      if (segSize + lineJpSize > maxLength || segJp.length >= maxLine) {
        if (segJp.length > 0) {
          if (textZh === undefined) {
            segs.push([segJp]);
          } else {
            segs.push([segJp, segZh]);
            segZh = [];
          }
          segJp = [];
          segSize = 0;
        }
      }

      if (textZh !== undefined) {
        const lineZh = textZh[i];
        segZh.push(lineZh);
      }

      segJp.push(lineJp);
      segSize += lineJpSize;
    }

    if (segJp.length > 0) {
      if (textZh === undefined) {
        segs.push([segJp]);
      } else {
        segs.push([segJp, segZh]);
      }
    }
    return segs;
  };
};

export interface SegmentCache {
  cacheKey(seg: string[], extra?: unknown): string;
  get(cacheKey: string): Promise<string[] | undefined>;
  save(cacheKey: string, output: string[]): Promise<void>;
}

export const createSegIndexedDbCache = async (
  storeName: 'sakura-seg-cache',
) => {
  return <SegmentCache>{
    cacheKey: (seg: string[], extra?: unknown): string =>
      MD5(JSON.stringify({ seg, extra })).toString(),

    get: (hash: string): Promise<string[] | undefined> =>
      TranslationCacheRepo.get(storeName, hash),

    save: (hash: string, text: string[]): Promise<void> =>
      TranslationCacheRepo.create(storeName, hash, text).then(() => {}),
  };
};
