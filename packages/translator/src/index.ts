// 用户入口：流水线 + 工厂。
export { TranslationPipeline } from './pipeline/translation-pipeline';
export { createTranslator } from './translator/factory';
export type { TranslatorConfig } from './translator/factory';
export { openAiProfiles } from './translator/profiles/openai';
export type { openAiProfileId } from './translator/profiles/openai';
export type { ProfileValues } from './translator/profiles/types';

// 约定：自定义翻译器只需实现 Translator。
export type {
  Glossary,
  Logger,
  SegmentContext,
  TranslateRequest,
  Translator,
  TranslatorProbe,
} from './types';
export {
  TranslationRejected,
  TranslationUnavailable,
} from './translator/errors';

// 流水线的输入输出、缓存与事件。
export type {
  Segment,
  SegmentCache,
  SegmentSummary,
  SegmentTracker,
  TranslatorOptions,
  TranslatorTracker,
  TranslationInput,
  TranslationResult,
  TranslationWork,
} from './types';

// 内置翻译器：供旧的有道/Sakura 入口与模型公示使用。
export { SakuraTranslator } from './translator/sakura-translator';
export type { SakuraTranslatorConfig } from './translator/sakura-translator';
export { allowModels } from './translator/sakura-prompt';
export type { ModelMeta } from './translator/sakura-prompt';
export { YoudaoTranslator } from './translator/youdao-translator';
