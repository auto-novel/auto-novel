import { isEqual } from 'lodash-es';

import type { Glossary } from '@/model/Glossary';
import type { TranslatorId } from '@/model/Translator';

import { BaiduTranslator } from './TranslatorBaidu';
import { OpenAiTranslator } from './TranslatorOpenAi';
import { SakuraTranslator } from './TranslatorSakura';
import { YoudaoTranslator } from './TranslatorYoudao';
import type { Logger, SegmentCache, SegmentTranslator } from './Common';
import { createSegIndexedDbCache } from './Common';
import { RegexUtil } from '@/util';

export type TranslatorConfig =
  | { id: 'baidu' }
  | { id: 'youdao' }
  | ({ id: 'gpt' } & OpenAiTranslator.Config)
  | ({ id: 'sakura' } & SakuraTranslator.Config);

export class Translator {
  id: TranslatorId;
  log: (message: string) => void;
  segTranslator: SegmentTranslator;
  segCache?: SegmentCache;

  constructor(
    segTranslator: SegmentTranslator,
    segCache?: SegmentCache,
    log?: (message: string) => void,
  ) {
    this.id = segTranslator.id;
    this.segTranslator = segTranslator;
    this.segCache = segCache;
    this.log = log ?? (() => {});
  }

  allowUpload() {
    return !(
      this.segTranslator instanceof SakuraTranslator &&
      !this.segTranslator.allowUpload()
    );
  }

  sakuraModel() {
    if (this.segTranslator instanceof SakuraTranslator) {
      return this.segTranslator.model?.id ?? '未知';
    } else {
      return '';
    }
  }

  async translatePlain(textJp: string) {
    const result = await this.translate(textJp.split('\n'));
    return result.join('\n');
  }

  async translate(
    textJp: string[],
    context?: {
      glossary?: Glossary;
      oldTextZh?: string[] | undefined;
      oldGlossary?: Glossary;
      force?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<string[]> {
    const oldTextZh = context?.oldTextZh;
    const textZh = await emptyLineFilterWrapper(
      textJp,
      oldTextZh,
      async (textJp, oldTextZh) => {
        if (textJp.length === 0) return [];

        const segsZh: string[][] = [];
        const segs = this.segTranslator.segmentor(textJp, oldTextZh);
        const size = segs.length;
        for (const [index, [segJp, oldSegZh]] of segs.entries()) {
          const segZh = await this.translateSeg(segJp, {
            logPrefix: `分段${index + 1}/${size}`,
            ...context,
            prevSegs: segsZh,
            oldSegZh,
          });
          if (segJp.length !== segZh.length) {
            throw new Error('翻译结果行数不匹配。不应当出现，请反馈给站长。');
          }
          segsZh.push(segZh);
        }
        return segsZh.flat();
      },
    );
    return textZh;
  }

  private async translateSeg(
    seg: string[],
    {
      logPrefix,
      glossary,
      oldSegZh,
      oldGlossary,
      prevSegs,
      force,
      signal,
    }: {
      logPrefix: string;
      glossary?: Glossary;
      oldSegZh?: string[];
      oldGlossary?: Glossary;
      prevSegs: string[][];
      force?: boolean;
      signal?: AbortSignal;
    },
  ) {
    glossary = glossary || {};
    oldGlossary = oldGlossary || {};

    // 检测分段是否需要重新翻译
    const segGlossary = filterGlossary(glossary, seg);
    if (!force && oldSegZh !== undefined) {
      const segOldGlossary = filterGlossary(oldGlossary, seg);
      if (isEqual(segGlossary, segOldGlossary)) {
        this.log(logPrefix + '　术语表无变化，无需翻译');
        return oldSegZh;
      }
    }

    // 检测是否有分段缓存存在
    let cacheKey: string | undefined;
    if (this.segCache) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extra: any = { glossary };
        if (this.segTranslator instanceof SakuraTranslator) {
          extra.version = this.segTranslator.version;
          extra.model = this.segTranslator.model;
        }
        cacheKey = this.segCache.cacheKey(seg, extra);
        const cachedSegOutput = await this.segCache.get(cacheKey);
        if (cachedSegOutput && cachedSegOutput.length === seg.length) {
          this.log(logPrefix + '　从缓存恢复');
          return cachedSegOutput;
        }
      } catch (e) {
        console.error('缓存读取失败');
        console.error(e);
      }
    }

    // 翻译
    this.log(logPrefix);
    const segOutput = await this.segTranslator.translate(seg, {
      glossary: segGlossary,
      prevSegs,
      signal,
    });
    if (segOutput.length !== seg.length) {
      throw new Error('分段翻译结果行数不匹配，请反馈给站长');
    }

    // 翻译器通常不会保留行首空格，尝试手动恢复
    for (let i = 0; i < seg.length; i++) {
      const lineJp = seg[i];
      if (lineJp.trim().length === 0) continue;
      const space = RegexUtil.getLeadingSpaces(lineJp);
      segOutput[i] = space + segOutput[i].trimStart();
    }

    // 保存分段缓存
    if (this.segCache && cacheKey !== undefined) {
      try {
        await this.segCache.save(cacheKey, segOutput);
      } catch (e) {
        console.error('缓存保存失败');
        console.error(e);
      }
    }

    return segOutput;
  }
}

export namespace Translator {
  export const createSegmentTranslator = async (
    log: Logger,
    config: TranslatorConfig,
  ): Promise<SegmentTranslator> => {
    if (config.id === 'baidu') {
      return BaiduTranslator.create(log);
    } else if (config.id === 'youdao') {
      return YoudaoTranslator.create(log);
    } else if (config.id === 'gpt') {
      return OpenAiTranslator.create(log, config);
    } else {
      return SakuraTranslator.create(log, config);
    }
  };

  export const create = async (
    config: TranslatorConfig,
    cache: boolean = false,
    log?: Logger,
  ) => {
    log = log ?? (() => {});
    const segTranslator = await createSegmentTranslator(
      (message, detail) => log?.('　' + message, detail),
      config,
    );
    let segCache: SegmentCache | undefined = undefined;
    if (cache) {
      if (config.id === 'gpt') {
        segCache = await createSegIndexedDbCache('gpt-seg-cache');
      } else if (config.id === 'sakura') {
        segCache = await createSegIndexedDbCache('sakura-seg-cache');
      }
    }
    return new Translator(segTranslator, segCache, log);
  };
}

const filterGlossary = (glossary: Glossary, text: string[]) => {
  const filteredGlossary: Glossary = {};
  for (const wordJp in glossary) {
    if (text.some((it) => it.includes(wordJp))) {
      filteredGlossary[wordJp] = glossary[wordJp];
    }
  }
  return filteredGlossary;
};

const emptyLineFilterWrapper = async (
  textJp: string[],
  oldTextZh: string[] | undefined,
  callback: (
    textJp: string[],
    oldTextZh: string[] | undefined,
  ) => Promise<string[]>,
) => {
  const textJpFiltered: string[] = [];
  const oldTextZhFiltered: string[] = [];
  for (let i = 0; i < textJp.length; i++) {
    const lineJp = textJp[i].replace(/\r?\n|\r/g, '');
    if (!(lineJp.trim() === '' || lineJp.startsWith('<图片>'))) {
      textJpFiltered.push(lineJp);
      if (oldTextZh !== undefined) {
        const lineZh = oldTextZh[i];
        oldTextZhFiltered.push(lineZh);
      }
    }
  }

  const textZh = await callback(
    textJpFiltered,
    oldTextZh === undefined ? undefined : oldTextZhFiltered,
  );

  const recoveredTextZh: string[] = [];
  for (const lineJp of textJp) {
    const realLineJp = lineJp.replace(/\r?\n|\r/g, '');
    if (realLineJp.trim() === '' || realLineJp.startsWith('<图片>')) {
      recoveredTextZh.push(lineJp);
    } else {
      const outputLine = textZh.shift();
      recoveredTextZh.push(outputLine!);
    }
  }
  return recoveredTextZh;
};
