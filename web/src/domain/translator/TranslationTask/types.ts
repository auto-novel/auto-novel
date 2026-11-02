import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';

export interface ChapterDetail {
  paragraphs: string[];
  glossary: Glossary;
  glossaryId: string;
  oldParagraphZh?: string[] | null;
  oldGlossary?: Glossary;
}

export interface TaskExecutionContext {
  signal: AbortSignal;
  canUpload?: () => boolean;
  onLog: (message: string) => void;
}

export interface TranslationTask {
  readonly type: 'local' | 'web' | 'wenku';
  readonly description: string;
  readonly chapters: ChapterMeta[];
  readonly glossary: Glossary;
  readonly glossaryId: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  /** 初始化标记，initMeta 执行完毕后设为 true*/
  initialized: boolean;
  /** 调用以初始化内部参数。防止多个Task初始化时发出大量请求 */
  initMeta(signal?: AbortSignal): Promise<void>;
  /** 只允许浏览器爬虫只在正式执行任务时更新目录。 */
  readonly needsPreparation?: boolean;
  prepareExecution?(context: TaskExecutionContext): Promise<void>;
  /** 即使没有待翻章节，也可能需要翻译网络小说元数据 */
  readonly needsMetadata?: boolean;
  /** 翻译元数据（标题、简介、目录），仅网络小说支持 */
  translateMetadata?(
    translate: (texts: string[]) => Promise<string[]>,
    signal?: AbortSignal,
    canUpload?: () => boolean,
  ): Promise<void>;
  fetchChapter(
    chapterId: string,
    context?: TaskExecutionContext,
  ): Promise<ChapterDetail>;
  uploadChapter(
    chapterId: string,
    glossaryId: string,
    translated: string[],
    context?: TaskExecutionContext,
  ): Promise<void>;
}
