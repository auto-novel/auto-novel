import type { Logger, Translator } from '@/types';

import {
  OpenAiTranslator,
  type OpenAiTranslatorConfig,
} from './translator/llm';
import {
  SakuraTranslator,
  type SakuraTranslatorConfig,
} from './translator/sakura';

/** 可按配置直接创建的翻译器；有道需要浏览器插件提供的客户端，不在此列。 */
export type TranslatorConfig =
  | ({ kind: 'openai' } & Omit<OpenAiTranslatorConfig, 'log'>)
  | ({ kind: 'sakura' } & Omit<SakuraTranslatorConfig, 'log'>);

/**
 * 按配置创建翻译器；Sakura 需要先探测模型，因此统一返回 Promise。
 * 是否允许派发由 `Translator.probe()` 与流水线的 `approved` 决定。
 */
export function createTranslator(
  config: TranslatorConfig,
  log?: Logger,
): Promise<Translator> {
  switch (config.kind) {
    case 'openai': {
      const { kind: _kind, ...rest } = config;
      return Promise.resolve(new OpenAiTranslator({ ...rest, log }));
    }
    case 'sakura': {
      const { kind: _kind, ...rest } = config;
      return SakuraTranslator.create({ ...rest, log });
    }
  }
}
