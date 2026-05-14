import { YoudaoApi, YoudaoTranslateResult } from '@/api';
import { RegexUtil, safeJson } from '@/util';
import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createGlossaryWrapper, createLengthSegmentor } from './Common';

export class YoudaoTranslator implements SegmentTranslator {
  id = <const>'youdao';
  log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  async init() {
    try {
      try {
        await YoudaoApi.rlog();
      } catch {
        this.log(
          '无法访问有道 rlog，请临时关闭广告屏蔽插件，或将 rlogs.youdao.com 加入白名单',
        );
      }
      await YoudaoApi.refreshKey();
    } catch (e) {
      this.log('无法获得Key，使用默认值');
    }
    return this;
  }

  segmentor = createLengthSegmentor(3500);

  async translate(
    seg: string[],
    { glossary, signal }: SegmentContext,
  ): Promise<string[]> {
    return createGlossaryWrapper(glossary)(seg, (seg) =>
      this.translateInner(seg, signal),
    );
  }

  async translateInner(seg: string[], signal?: AbortSignal): Promise<string[]> {
    let from = 'auto';
    const segText = seg.join('\n');
    if (RegexUtil.hasHangulChars(segText)) {
      from = 'ko';
    } else if (RegexUtil.hasKanaChars(segText) || RegexUtil.hasHanzi(segText)) {
      from = 'ja';
    } else if (RegexUtil.hasEnglishChars(segText)) {
      from = 'en';
    }

    let translateWorker = async (seg: string[], from: string) => {
      const raw = await YoudaoApi.webtranslate(seg.join('\n'), from, {
        signal,
      });
      let json = safeJson<YoudaoTranslateResult>(raw);
      return { raw, json };
    };

    let { raw: decoded, json: decodedJson } = await translateWorker(seg, from);

    if (decodedJson === undefined) {
      this.log(`　错误：${decoded}`);
      throw 'quit';
    } else {
      switch (decodedJson.code) {
        case 0: // '正常';
          break;
        case 20:
          this.log('错误：要翻译的文本过长');
          // 原则上还能继续翻译其他章节
          throw new Error('错误：要翻译的文本过长');
        case 30:
          this.log('错误：无法进行有效的翻译');
          throw 'quit';
        case 40:
          this.log('警告：语言类型错误，正在尝试自动修复');
          const langs = ['en', 'ja', 'ko'] as const;
          const langResults = await Promise.all(
            langs.map((lang) => translateWorker(seg, lang)),
          );
          const idx = langResults.findIndex(({ json }) => json?.code === 0);
          if (idx === -1) throw new Error('错误：无法判断语言类型');
          this.log(`修正成功：已使用 ${langs[idx]} 重新翻译`);
          ({ raw: decoded, json: decodedJson } = langResults[idx]);
          decodedJson = decodedJson!; // make typescript happy
          break;
        case 50:
          this.log('错误：无效的 key');
          throw 'quit';
        case 60:
          this.log('错误：无词典结果，仅在获取词典结果生效');
          throw 'quit';
        default:
          this.log(`未知错误：${decoded}`);
          throw 'quit';
      }
      const result = decodedJson['translateResult']?.map((it) =>
        it.map((it) => it.tgt.trimEnd()).join(''),
      );
      if (!result) {
        this.log(`　错误：${decoded}`);
        throw 'quit';
      }
      return result;
    }
  }
}

export namespace YoudaoTranslator {
  export const create = (log: Logger) => new YoudaoTranslator(log).init();
}
