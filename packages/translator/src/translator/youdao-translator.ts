import type { KyInstance } from 'ky';

import type { Logger, TranslateRequest, Translator } from '@/types';
import { RegexUtil, safeJson } from '@/utils';

import { TranslationUnavailable } from './errors';
import { createYoudaoApi, type YoudaoTranslateResult } from './youdao-api';
import { createGlossaryCodec } from './youdao-glossary';

export type YoudaoTranslatorConfig = {
  client: KyInstance;
  log?: Logger;
};

export class YoudaoTranslator implements Translator {
  private api: ReturnType<typeof createYoudaoApi>;
  readonly log: Logger;

  constructor(config: YoudaoTranslatorConfig) {
    this.api = createYoudaoApi(config.client);
    this.log = config.log ?? (() => {});
  }

  async init() {
    try {
      try {
        await this.api.rlog();
      } catch {
        this.log(
          '无法访问有道 rlog，请临时关闭广告屏蔽插件，或将 rlogs.youdao.com 加入白名单',
        );
      }
      await this.api.refreshKey();
    } catch {
      this.log('无法获得Key，使用默认值');
    }
    return this;
  }

  async translate({
    lines,
    context,
    signal,
  }: TranslateRequest): Promise<string[]> {
    // 有道不支持提示词术语表，先用占位符替换，译完再还原。
    const codec = createGlossaryCodec(context?.glossary ?? {});
    const encoded = codec.encode(lines);
    let from = 'auto';
    const text = encoded.join('\n');

    if (RegexUtil.hasHangulChars(text)) {
      from = 'ko';
    } else if (RegexUtil.hasKanaChars(text) || RegexUtil.hasHanzi(text)) {
      from = 'ja';
    } else if (RegexUtil.hasEnglishChars(text)) {
      from = 'en';
    }

    const translateWorker = async (input: string[], lang: string) => {
      const raw = await this.api.webtranslate(input.join('\n'), lang, {
        signal,
      });
      const json = safeJson<YoudaoTranslateResult>(raw);
      return { raw, json };
    };

    let { raw: decoded, json: decodedJson } = await translateWorker(
      encoded,
      from,
    );

    if (decodedJson === undefined) {
      this.log(`　错误：${decoded}`);
      throw new TranslationUnavailable('有道翻译返回了无法解析的结果');
    }

    switch (decodedJson.code) {
      case 0:
        break;
      case 20:
        this.log('错误：要翻译的文本过长');
        throw new TranslationUnavailable('分段过长，有道无法翻译');
      case 30:
        this.log('错误：无法进行有效的翻译');
        throw new TranslationUnavailable('有道无法进行有效的翻译');
      case 40: {
        this.log('警告：语言类型错误，正在尝试自动修复');
        const langs = ['en', 'ja', 'ko'] as const;
        const langResults = await Promise.all(
          langs.map((lang) => translateWorker(encoded, lang)),
        );
        const idx = langResults.findIndex(({ json }) => json?.code === 0);
        if (idx === -1) {
          throw new TranslationUnavailable('有道无法判断原文语言');
        }
        this.log(`修正成功：已使用 ${langs[idx]} 重新翻译`);
        ({ raw: decoded, json: decodedJson } = langResults[idx]);
        decodedJson = decodedJson!;
        break;
      }
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

    const result = decodedJson.translateResult?.map((it) =>
      it.map((item) => item.tgt.trimEnd()).join(''),
    );
    if (!result) {
      this.log(`　错误：${decoded}`);
      throw new TranslationUnavailable('有道未返回译文');
    }

    return codec.decode(result);
  }
}
