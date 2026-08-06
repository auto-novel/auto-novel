import { YoudaoTranslator as PackageYoudaoTranslator } from '@auto-novel/translator';
import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createGlossaryWrapper, createLengthSegmentor } from './Common';
import { createYoudaoTranslator } from '@/external';

export class YoudaoTranslator implements SegmentTranslator {
  id = <const>'youdao';
  log: Logger;
  segmentor = createLengthSegmentor(3500);
  private translator: PackageYoudaoTranslator;

  constructor(log: Logger, translator: PackageYoudaoTranslator) {
    this.log = log;
    this.translator = translator;
  }

  async translate(
    seg: string[],
    { glossary, signal }: SegmentContext,
  ): Promise<string[]> {
    return createGlossaryWrapper(glossary)(seg, (encodedSeg) =>
      this.translator.translate(encodedSeg, { glossary }, signal),
    );
  }
}

export namespace YoudaoTranslator {
  export const create = async (log: Logger) =>
    new YoudaoTranslator(log, await createYoudaoTranslator(log));
}
