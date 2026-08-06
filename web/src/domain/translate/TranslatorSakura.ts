import {
  SakuraTranslator as PackageSakuraTranslator,
  allowModels as packageAllowModels,
  type ModelMeta as PackageModelMeta,
  type SakuraTranslatorConfig,
} from '@auto-novel/translator';

import type { Logger, SegmentContext, SegmentTranslator } from './Common';
import { createLengthSegmentor } from './Common';

export class SakuraTranslator implements SegmentTranslator {
  id = <const>'sakura';
  log: Logger;
  segmentor = createLengthSegmentor(500);
  segLength = 500;
  private translator: PackageSakuraTranslator;

  constructor(
    log: Logger,
    translator: PackageSakuraTranslator,
    segLength?: number,
  ) {
    this.log = log;
    if (segLength !== undefined) {
      this.segmentor = createLengthSegmentor(segLength);
      this.segLength = segLength;
    }
    this.translator = translator;
  }

  get version() {
    return this.translator.currentVersion;
  }

  get model() {
    return this.translator.model;
  }

  allowUpload() {
    if (this.segLength !== 500) {
      this.log('分段长度不是500');
      return false;
    }
    return this.translator.allowUpload();
  }

  translate(seg: string[], { glossary, prevSegs, signal }: SegmentContext) {
    return this.translator.translate(seg, { glossary, prevSegs }, signal);
  }
}

export namespace SakuraTranslator {
  export interface Config extends SakuraTranslatorConfig {
    segLength?: number;
  }

  export const create = async (log: Logger, { segLength, ...config }: Config) =>
    new SakuraTranslator(
      log,
      await PackageSakuraTranslator.create({
        ...config,
        log,
      }),
      segLength,
    );

  export const allowModels = packageAllowModels;
  export type ModelMeta = PackageModelMeta;
}
