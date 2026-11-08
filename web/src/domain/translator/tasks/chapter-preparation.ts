import type { Glossary } from '@auto-novel/translator';
import type { TranslateTaskParams } from './task-descriptor';
import type { PreparedUnit, TaskChapter } from './task';

/** 正文段落保持一一对应；元数据由自己的 coder 处理，不使用此转换。 */
export function prepareChapterInput(
  paragraphs: readonly string[],
  glossary: Glossary,
  level: TranslateTaskParams['level'],
  oldParagraphZh?: readonly string[] | null,
  oldGlossary?: Glossary,
): Pick<PreparedUnit, 'lines' | 'glossary' | 'history'> {
  const lines = paragraphs.map((line) => line.replace(/[\r\n]/g, ''));
  return {
    lines,
    glossary,
    history:
      level !== 'all' && oldParagraphZh
        ? {
            lines,
            translatedLines: oldParagraphZh,
            glossary: oldGlossary ?? {},
          }
        : undefined,
  };
}

export function buildChapterList<T>(
  items: T[],
  startIndex: number,
  level: TranslateTaskParams['level'],
  isDone: (item: T) => boolean,
  isExpired: (item: T) => boolean,
  toMeta: (item: T) => { chapterId: string; title: string },
): TaskChapter[] {
  const chapters: TaskChapter[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const order = startIndex + i;
    const done = isDone(item);
    if (level === 'normal' && done) continue;
    if (level === 'expire' && done && !isExpired(item)) continue;
    chapters.push({
      ...toMeta(item),
      kind: 'chapter',
      order,
      completed: false,
    });
  }
  return chapters;
}
