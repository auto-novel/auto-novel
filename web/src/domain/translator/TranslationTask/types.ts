import type { ChapterMeta, ChapterContent } from '../TaskState';
import type { Glossary } from '@auto-novel/translator';

export interface TranslationTask {
  readonly type: 'local' | 'web' | 'wenku';
  readonly description: string;
  readonly chapters: ChapterMeta[];
  readonly glossary: Glossary;
  readonly glossaryId: string;

  /** 调用以初始化内部参数。防止多个Task初始化时发出大量请求 */
  initMeta(signal?: AbortSignal): Promise<void>;
  fetchChapter(chapterId: string): Promise<ChapterContent>;
  fetchTranslation(chapterId: string): Promise<string[] | null>;
  uploadChapter(
    chapterId: string,
    glossaryId: string,
    translated: string[],
  ): Promise<void>;
}
