// 用户入口：流水线 + 工厂。
export { TranslationPipeline } from './pipeline/pipeline';
export { createTranslator } from './factory';
export type { TranslatorConfig } from './factory';
export {
  openAiProfiles,
  parseOpenAiProfileSelection,
} from './translator/llm-profiles';
export type {
  openAiProfileId,
  OpenAiProfileSelection,
  ProfileValues,
} from './translator/llm-profiles';

// 约定：自定义翻译器只需实现 Translator。
export type {
  Glossary,
  Logger,
  SegmentContext,
  TranslateRequest,
  Translator,
} from './types';
export { TranslationRejected, TranslationUnavailable } from './errors';

// 流水线的输入输出、缓存与事件。
export type {
  Segment,
  SegmentCache,
  SegmentTracker,
  TranslatorOptions,
  TranslationInput,
  TranslationResult,
  TranslationWork,
} from './types';

// 内置翻译器：供旧的有道/Sakura 入口与模型公示使用。
export { SakuraTranslator } from './translator/sakura';
export type { SakuraTranslatorConfig } from './translator/sakura';
export { allowModels } from './translator/sakura-prompt';
export type { ModelMeta } from './translator/sakura-prompt';
export { YoudaoTranslator } from './translator/youdao';
