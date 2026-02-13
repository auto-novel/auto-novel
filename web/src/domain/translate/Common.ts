import { MD5 } from 'crypto-es/lib/md5';
import { customAlphabet } from 'nanoid';

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
  prevSegs: string[][];
  signal?: AbortSignal;
};

export interface SegmentTranslator {
  id: TranslatorId;
  segmentor: Segmentor;
  translate: (seg: string[], context: SegmentContext) => Promise<string[]>;
  log: (message: string, detail?: string[]) => void;
}

export const createGlossaryWrapper = (glossary: Glossary) => {
  for (const key in glossary) {
    const parts = glossary[key].split('#');
    if (parts.length > 1) {
      glossary[key] = parts[0].trim();
    }
  }

  const presetTokens = [
    'kie',
    'rgx',
    'wfv',
    'oyg',
    'yhs',
    'rvy',
    'dpt',
    'wkj',
    'gzg',
    'xef',
    'efx',
    'ugx',
    'woz',
    'peh',
    'rjp',
    'eon',
    'ayj',
    'gkp',
    'wie',
    'yla',
  ];
  const usedToken: string[] = [];
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz', 4);
  const generateToken = () => {
    let token = presetTokens.shift();
    if (token === undefined) {
      while (true) {
        token = nanoid();
        if (
          !/(.)\1/.test(token) &&
          !usedToken.some((used) => token!.includes(used))
        ) {
          break;
        }
      }
    }
    usedToken.push(token);
    return token;
  };

  const sortedKeys = (glossary: Glossary) =>
    Object.keys(glossary).sort((a, b) => b.length - a.length);

  const wordJpToToken: Glossary = {};
  const tokenToWordZh: Glossary = {};
  for (const wordJp of sortedKeys(glossary)) {
    const wordZh = glossary[wordJp];
    const token = generateToken();
    wordJpToToken[wordJp] = token;
    tokenToWordZh[token] = wordZh;
  }

  const encode = (text: string[]): string[] => {
    return text.map((line) => {
      for (const wordJp of sortedKeys(wordJpToToken)) {
        const token = wordJpToToken[wordJp];
        line = line.replaceAll(wordJp, '$' + token);
      }
      return line;
    });
  };

  const decode = (text: string[]): string[] => {
    return text.map((line) => {
      for (const token of sortedKeys(tokenToWordZh)) {
        const wordZh = tokenToWordZh[token];
        line = line
          .replaceAll('$' + token, wordZh)
          .replaceAll('$ ' + token, wordZh);
      }
      return line;
    });
  };

  return async (
    textJp: string[],
    callback: (input: string[]) => Promise<string[]>,
  ) => {
    const textJpEncoded = encode(textJp);
    const textZh = await callback(textJpEncoded);
    const textZhDecoded = decode(textZh);
    return textZhDecoded;
  };
};

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
  storeName: 'gpt-seg-cache' | 'sakura-seg-cache',
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
