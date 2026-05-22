import type { ChapterMeta, ChapterStatus } from '../TaskState';

export function buildChapterMetaList<T>(
  items: T[],
  startIndex: number,
  level: 'normal' | 'expire' | 'all' | 'sync',
  isDone: (item: T) => boolean,
  toMeta: (item: T, order: number) => { chapterId: string; title: string },
): ChapterMeta[] {
  const chapters: ChapterMeta[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const order = startIndex + i;
    const done = isDone(item);
    if (level === 'normal' && done) continue;
    const status: ChapterStatus =
      level === 'all' ? 'pending' : done ? 'done' : 'pending';
    chapters.push({ ...toMeta(item, order), order, status });
  }
  return chapters;
}
