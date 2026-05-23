import type { Glossary } from '@auto-novel/translator';
import type { ChapterMeta } from '../TaskState';

export interface ChapterDetail {
  paragraphs: string[];
  glossary: Glossary;
  glossaryId: string;
  oldParagraphZh?: string[] | null;
  oldGlossary?: Glossary;
}

export interface TranslationTask {
  readonly type: 'local' | 'web' | 'wenku';
  readonly description: string;
  readonly chapters: ChapterMeta[];
  readonly glossary: Glossary;
  readonly glossaryId: string;

  /** 调用以初始化内部参数。防止多个Task初始化时发出大量请求 */
  initMeta(signal?: AbortSignal): Promise<void>;
  fetchChapter(chapterId: string): Promise<ChapterDetail>;
  uploadChapter(
    chapterId: string,
    glossaryId: string,
    translated: string[],
  ): Promise<void>;
}
