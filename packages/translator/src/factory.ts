import type { Translator } from '@/types';

import {
  OpenAiTranslator,
  type OpenAiTranslatorConfig,
} from './translator/llm';
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
      return Promise.resolve(new OpenAiTranslator(config));
    case 'sakura':
      return SakuraTranslator.create(config);
    case 'youdao':
      return new YoudaoTranslator(config).init();
  }
}
