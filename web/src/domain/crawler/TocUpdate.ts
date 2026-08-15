export type CrawlerTocItem = Readonly<{
  title: string;
  chapterId: string | null;
  createAt: string | null;
}>;

export type TocUpdateKind = 'unchanged' | 'append-only' | 'existing-updated';

const isSameTocItem = (left: CrawlerTocItem, right: CrawlerTocItem) =>
  left.title === right.title &&
  left.chapterId === right.chapterId &&
  left.createAt === right.createAt;

// 检测目录更新是否为仅追加（append-only）更新。
export const classifyTocUpdate = (
  currentToc: readonly CrawlerTocItem[],
  newToc: readonly CrawlerTocItem[],
): TocUpdateKind => {
  const currentChapterIds = new Set(
    currentToc.flatMap((item) =>
      item.chapterId == null ? [] : [item.chapterId],
    ),
  );
  const currentChapterItems = currentToc.filter(
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
    const currentItem = currentToc[currentIndex];
    if (currentItem != null && isSameTocItem(currentItem, newItem)) {
      currentIndex += 1;
    }
  }
  if (currentIndex !== currentToc.length) {
    return 'existing-updated';
  }

  const hasNewChapter = newToc.some(
    (item) => item.chapterId != null && !currentChapterIds.has(item.chapterId),
  );
  return hasNewChapter ? 'append-only' : 'unchanged';
};
