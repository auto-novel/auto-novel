import {
  OpenAiTranslator as PackageOpenAiTranslator,
  type OpenAiTranslatorConfig,
} from '@auto-novel/translator';

import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createLengthSegmentor } from './Common';

export class OpenAiTranslator implements SegmentTranslator {
  id = <const>'gpt';
  log: Logger;
  segmentor = createLengthSegmentor(1500, 30);
  private translator: PackageOpenAiTranslator;

  constructor(log: Logger, config: OpenAiTranslator.Config) {
    this.log = log;
    this.translator = new PackageOpenAiTranslator({
      ...config,
      log,
    });
  }

  translate(seg: string[], { glossary, prevSegs, signal }: SegmentContext) {
    return this.translator.translate(seg, { glossary, prevSegs }, signal);
  }
}

export namespace OpenAiTranslator {
  export type Config = OpenAiTranslatorConfig;
  export const create = (log: Logger, config: Config) =>
    new OpenAiTranslator(log, config);
}
