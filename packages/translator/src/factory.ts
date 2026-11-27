import type { Translator } from '@/types';
import { GlossaryAwareOpenAiTranslator } from './translator/llm-glossary';

import type { OpenAiTranslatorConfig } from './translator/llm';
import {
  SakuraTranslator,
  type SakuraTranslatorConfig,
} from './translator/sakura';
import {
  YoudaoTranslator,
  type YoudaoTranslatorConfig,
} from './translator/youdao';

export type TranslatorConfig =
  | ({ kind: 'openai' } & OpenAiTranslatorConfig)
  | ({ kind: 'sakura' } & SakuraTranslatorConfig)
  | ({ kind: 'youdao' } & YoudaoTranslatorConfig);

export function createTranslator(
  config: TranslatorConfig,
): Promise<Translator> {
  switch (config.kind) {
    case 'openai':
      return Promise.resolve(new GlossaryAwareOpenAiTranslator(config));
    case 'sakura':
      return SakuraTranslator.create(config);
    case 'youdao':
      return new YoudaoTranslator(config).init();
  }
}
