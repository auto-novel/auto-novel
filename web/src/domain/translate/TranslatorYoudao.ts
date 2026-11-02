import type { Translator } from '@auto-novel/translator';
import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createLengthSegmentor } from './Common';
import { createYoudaoTranslator } from '@/external';

export class YoudaoTranslator implements SegmentTranslator {
  id = <const>'youdao';
  log: Logger;
  segmentor = createLengthSegmentor(3500);
  private translator: Translator;

  constructor(log: Logger, translator: Translator) {
    this.log = log;
    this.translator = translator;
  }

  async translate(seg: string[], { glossary, signal }: SegmentContext) {
    // 术语保护、特殊行与行校验都由翻译包与流水线负责。
    const lines = await this.translator.translate({
      lines: seg,
      context: { glossary },
      signal,
      attempt: 0,
    });
    return [...lines];
  }
}

export namespace YoudaoTranslator {
  export const create = async (log: Logger) =>
    new YoudaoTranslator(log, await createYoudaoTranslator(log));
}
