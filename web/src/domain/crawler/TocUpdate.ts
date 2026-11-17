export type CrawlerTocItem = Readonly<{
  title: string;
  chapterId: string | null;
  createAt: string | null;
}>;

export type TocUpdateKind =
  | 'unchanged'
  | 'append-only'
  | 'chapters-deleted'
  | 'existing-updated';

const isSameTocItem = (left: CrawlerTocItem, right: CrawlerTocItem) =>
  left.title === right.title &&
  left.chapterId === right.chapterId &&
  left.createAt === right.createAt;

// 允许新增章节或最多删除 3 个章节，其余已有目录项必须保持不变。
export const classifyTocUpdate = (
  currentToc: readonly CrawlerTocItem[],
  newToc: readonly CrawlerTocItem[],
): TocUpdateKind => {
  const currentChapterIds = new Set(
    currentToc.flatMap((item) =>
      item.chapterId == null ? [] : [item.chapterId],
    ),
  );
  const newChapterIds = new Set(
    newToc.flatMap((item) => (item.chapterId == null ? [] : [item.chapterId])),
  );
  const remainingToc = currentToc.filter(
    (item) => item.chapterId == null || newChapterIds.has(item.chapterId),
  );
  const deletedCount = currentToc.length - remainingToc.length;
  if (deletedCount > 3) {
    return 'existing-updated';
  }
  const currentChapterItems = remainingToc.filter(
    (item) => item.chapterId != null,
  );
  const newExistingChapterItems = newToc.filter(
    (item) => item.chapterId != null && currentChapterIds.has(item.chapterId),
  );

  if (
    currentChapterItems.length !== newExistingChapterItems.length ||
    currentChapterItems.some(
      (item, index) => !isSameTocItem(item, newExistingChapterItems[index]!),
    )
  ) {
    return 'existing-updated';
  }

  let currentIndex = 0;
  for (const newItem of newToc) {
    const currentItem = remainingToc[currentIndex];
    if (currentItem != null && isSameTocItem(currentItem, newItem)) {
      currentIndex += 1;
    }
  }
  if (currentIndex !== remainingToc.length) {
    return 'existing-updated';
  }

  const hasNewChapter = newToc.some(
    (item) => item.chapterId != null && !currentChapterIds.has(item.chapterId),
  );
  if (deletedCount > 0) {
    return 'chapters-deleted';
  }
  return hasNewChapter ? 'append-only' : 'unchanged';
};
