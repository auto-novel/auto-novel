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
  onLog: (message: string) => void;
}

export interface PreparedMetadata {
  lines: string[];
  glossary: Glossary;
  save(translated: string[]): Promise<void>;
}

export interface TranslationTask {
  readonly type: 'local' | 'web' | 'wenku';
  readonly description: string;
  readonly chapters: ChapterMeta[];
  readonly glossary: Glossary;
  readonly glossaryId: string;
  readonly level: 'normal' | 'expire' | 'all' | 'sync';
  /** initialize 完成后为 true；调度层负责串行初始化同一任务版本。 */
  initialized: boolean;
  /** 正式执行前初始化；网络小说先按需更新目录，再加载任务快照。 */
  initialize(context: TaskExecutionContext): Promise<void>;
  /** 独立于正文列表的元数据翻译单元。 */
  readonly metadataUnit?: ChapterMeta;
  prepareMetadata?(context: TaskExecutionContext): Promise<PreparedMetadata>;
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
