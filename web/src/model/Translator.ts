import type { Glossary } from './Glossary';
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
}

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

//
export type WebTranslateTaskDesc = {
  type: 'web';
  providerId: string;
  novelId: string;
};

export type WenkuTranslateTaskDesc = {
  type: 'wenku';
  novelId: string;
  volumeId: string;
};

export type LocalTranslateTaskDesc = {
  type: 'local';
  volumeId: string;
};

export type TranslateTaskDesc =
  | WebTranslateTaskDesc
  | WenkuTranslateTaskDesc
  | LocalTranslateTaskDesc;

export type TranslateTaskParams = {
  level: 'normal' | 'expire' | 'all' | 'sync'; // 翻译等级
  forceMetadata: boolean; // 强制重翻元数据
  useBrowserCrawler: boolean; // 是否启用浏览器爬虫
  startIndex: number;
  endIndex: number;
};

type TranslateTaskDescriptor = string;

export namespace TranslateTaskDescriptor {
  const buildTaskQueryString = ({
    level,
    forceMetadata,
    useBrowserCrawler,
    startIndex,
    endIndex,
  }: TranslateTaskParams) => {
    const searchParamsInit: { [key: string]: string } = {
      level,
      forceMetadata: forceMetadata.toString(),
      useBrowserCrawler: useBrowserCrawler.toString(),
      startIndex: startIndex.toString(),
      endIndex: endIndex.toString(),
    };
    const searchParams = new URLSearchParams(searchParamsInit).toString();
    return searchParams ? `?${searchParams}` : '';
  };

  export const web = (
    providerId: string,
    novelId: string,
    params: TranslateTaskParams,
  ) => `web/${providerId}/${novelId}` + buildTaskQueryString(params);

  export const wenku = (
    novelId: string,
    volumeId: string,
    params: TranslateTaskParams,
  ) =>
    `wenku/${novelId}/${encodeURIComponent(volumeId)}` +
    buildTaskQueryString(params);

  export const local = (volumeId: string, params: TranslateTaskParams) =>
    `local/${encodeURIComponent(volumeId)}` + buildTaskQueryString(params);

  export const parse = (task: string) => {
    const [taskString, queryString] = task.split('?');

    let desc: TranslateTaskDesc;
    if (taskString.startsWith('web/')) {
      const [_, providerId, novelId] = taskString.split('/');
      desc = { type: 'web', providerId, novelId };
    } else if (taskString.startsWith('wenku/')) {
      const [_, novelId, volumeId] = taskString.split('/');
      desc = {
        type: 'wenku',
        novelId,
        volumeId: decodeURIComponent(volumeId),
      };
    } else if (
      taskString.startsWith('local/') ||
      taskString.startsWith('personal/') ||
      taskString.startsWith('personal2/')
    ) {
      const [_, volumeId] = taskString.split('/');
      desc = { type: 'local', volumeId: decodeURIComponent(volumeId) };
    } else {
      throw 'quit';
    }

    const query = new URLSearchParams(queryString);

    const queryBoolean = (name: string) => {
      return query.get(name) === 'true';
    };

    const queryInt = (name: string, defaultValue: number) => {
      const num = parseInt(query.get(name)!, 10);
      return isNaN(num) ? defaultValue : num;
    };

    const params: TranslateTaskParams = {
      level: query.get('level') as 'normal' | 'expire' | 'all' | 'sync',
      forceMetadata: queryBoolean('forceMetadata'),
      useBrowserCrawler: queryBoolean('useBrowserCrawler'),
      startIndex: queryInt('startIndex', 0),
      endIndex: queryInt('endIndex', 65535),
    };

    return { desc, params };
  };
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
