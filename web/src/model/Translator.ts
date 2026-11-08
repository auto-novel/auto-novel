import type { Glossary } from './Glossary';
import type { HarnessPresetId } from '@auto-novel/translator/harness/presets';
import type {
  OpenAiProfileSelection,
  TranslatorConfig,
} from '@auto-novel/translator';

export type TranslatorId = 'sakura' | 'youdao' | 'gpt';

/** 当前工作区支持的翻译器；有道仍使用独立入口。 */
export type WorkspaceTranslatorId = Exclude<TranslatorId, 'youdao'>;

export interface GptWorker {
  id: string;
  endpoint: string;
  model: string;
  key: string;
  concurrency?: number;
}

export interface GptPipelineWorker extends GptWorker {
  concurrency: number;
  profile?: OpenAiProfileSelection;
  preset?: TranslatorPresetId;
}

export type TranslatorPresetId = 'general' | HarnessPresetId;

export interface SakuraWorker {
  id: string;
  endpoint: string;
  concurrency?: number;
  segLength?: number;
  prevSegLength?: number;
}

/** 将工作区配置转换为 package 配置，不负责创建或探测翻译器。 */
export function toTranslatorConfig(
  translatorId: WorkspaceTranslatorId,
  worker: GptPipelineWorker | SakuraWorker,
): TranslatorConfig {
  if (translatorId === 'sakura') {
    return { kind: 'sakura', endpoint: worker.endpoint, prevSegLength: 500 };
  }
  const gpt = worker as GptPipelineWorker;
  return {
    kind: 'openai',
    endpoint: gpt.endpoint,
    key: gpt.key,
    model: gpt.model,
    profile: gpt.profile,
  };
}

export interface TranslateJob {
  task: string;
  description: string;
  createAt: number;
  finishAt?: number;
}

export type TranslateJobRecord = TranslateJob & {
  progress?: {
    finished: number;
    error: number;
    total: number;
  };
};

export namespace TranslateJob {
  export const isFinished = (job: TranslateJobRecord) =>
    job.progress !== undefined && job.progress.finished >= job.progress.total;
}

export interface WebTranslateTask {
  titleJp: string;
  titleZh?: string;
  introductionJp: string;
  introductionZh?: string;
  glossaryUuid: string;
  glossary: Glossary;
  toc: {
    chapterId?: string;
    titleJp: string;
    titleZh?: string;
    glossaryUuid?: string;
  }[];
}

export interface WebChapterTranslateTask {
  paragraphJp: string[];
  oldParagraphZh?: string[];
  glossaryId: string;
  glossary: Glossary;
  oldGlossaryId?: string;
  oldGlossary: Glossary;
}

export interface WenkuTranslateTask {
  glossaryId: string;
  toc: {
    chapterId: string;
    glossaryId?: string;
  }[];
}

export interface WenkuChapterTranslateTask {
  paragraphJp: string[];
  oldParagraphZh?: string[];
  glossaryId: string;
  glossary: Glossary;
  oldGlossaryId?: string;
  oldGlossary: Glossary;
}
