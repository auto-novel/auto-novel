import type { KyInstance } from 'ky';
import ky from 'ky';

import { YoudaoTranslator as PackageYoudaoTranslator } from '@auto-novel/translator';
import { lazy } from '@/util';
import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createGlossaryWrapper, createLengthSegmentor } from './Common';
import { ensureCookie } from '@/api/addon/util';

export class YoudaoTranslator implements SegmentTranslator {
  id = <const>'youdao';
  log: Logger;
  segmentor = createLengthSegmentor(3500);
  private translator: PackageYoudaoTranslator;

  constructor(log: Logger, client: KyInstance) {
    this.log = log;
    this.translator = new PackageYoudaoTranslator({
      client,
      log,
    });
  }

  async init() {
    await this.translator.init();
    return this;
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

const getClient = lazy(async (): Promise<KyInstance> => {
  const addon = window.Addon;
  if (!addon) return ky;

  await ensureCookie(addon, 'https://dict.youdao.com/', '.youdao.com', [
    'OUTFOX_SEARCH_USER_ID',
  ]);

  return ky.create({
    fetch: addon.fetch.bind(window.Addon),
  });
});

export namespace YoudaoTranslator {
  export const create = async (log: Logger) =>
    new YoudaoTranslator(log, await getClient()).init();
}
