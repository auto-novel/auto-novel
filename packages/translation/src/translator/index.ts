export { OpenAiTranslator } from './openai/translator_openai';
export type { OpenAiTranslatorConfig } from './openai/translator_openai';
export { SakuraTranslator } from './sakura/translator_sakura';
export type {
  SakuraVersion,
  SakuraTranslatorConfig,
} from './sakura/translator_sakura';
export { createOpenAiPromptBuilder } from './openai/prompt_openai';
export { createSakuraPromptBuilder } from './sakura/prompt_sakura';

import type { Translator } from '../types';
import {
  OpenAiTranslator,
  type OpenAiTranslatorConfig,
} from './openai/translator_openai';
import {
  SakuraTranslator,
  type SakuraTranslatorConfig,
} from './sakura/translator_sakura';

export type TranslatorConfig = OpenAiTranslatorConfig | SakuraTranslatorConfig;

export function createTranslator(config: TranslatorConfig): Translator {
  switch (config.type) {
    case 'openai':
      return new OpenAiTranslator(config);
    case 'sakura':
      return new SakuraTranslator(config);
    default:
      throw new Error(`Unknown translator type: ${(config as any).type}`);
  }
}
