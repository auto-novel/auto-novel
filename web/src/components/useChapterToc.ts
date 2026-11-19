import {
  computed,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';

import type { WebNovelTocItemDto } from '@/model/WebNovel';
import { checkIsMobile } from '@/util';

export type TocChapter = WebNovelTocItemDto & {
  kind: 'chapter';
  chapterId: string;
  key: string;
  order: number;
};
export type TocSection = WebNovelTocItemDto & {
  kind: 'section';
  key: string;
  expanded: boolean;
};
export type TocItem = TocChapter | TocSection;

export function useChapterToc(
  source: MaybeRefOrGetter<readonly WebNovelTocItemDto[] | undefined>,
  options: {
    defaultExpanded: MaybeRefOrGetter<boolean>;
    currentChapterId: MaybeRefOrGetter<string | undefined>;
    sortReverse: MaybeRefOrGetter<boolean>;
  },
) {
  const expansionLimit = checkIsMobile() ? 1000 : 3000;
  const expanded = shallowRef(new Map<string, boolean>());
  const normalized = computed<TocItem[]>(() => {
    const chapters = new Map<string, number>();
    const sections = new Map<string, number>();
    let order = 0;
    return (toValue(source) ?? []).map<TocItem>((item) => {
      if (item.chapterId !== undefined) {
        const occurrence = chapters.get(item.chapterId) ?? 0;
        chapters.set(item.chapterId, occurrence + 1);
        return {
          ...item,
          kind: 'chapter',
          key: `chapter:${JSON.stringify([item.chapterId, occurrence])}`,
          chapterId: item.chapterId,
          order: order++,
        };
      }
      const occurrence = sections.get(item.titleJp) ?? 0;
      sections.set(item.titleJp, occurrence + 1);
      return {
        ...item,
        kind: 'section',
        key: `section:${JSON.stringify([item.titleJp, occurrence])}`,
        expanded: false,
      };
    });
  });

  let initialized = false;
  let previousPreference: boolean | undefined;
  let previousChapterId: string | undefined;
  let previousSectionKey: string | undefined;
  watch(
    [
      normalized,
      () => toValue(options.defaultExpanded),
      () => toValue(options.currentChapterId),
    ],
    ([toc, preference, chapterId]) => {
      const sections = toc.filter(
        (item): item is TocSection => item.kind === 'section',
      );
      let sectionKey: string | undefined;
      let currentSectionKey: string | undefined;
      for (const item of toc) {
        if (item.kind === 'section') sectionKey = item.key;
        else if (chapterId !== undefined && item.chapterId === chapterId) {
          currentSectionKey = sectionKey;
          break;
        }
      }
      const defaultSectionKey = currentSectionKey ?? sections[0]?.key;
      const expandAllByDefault = preference && toc.length <= expansionLimit;
      const reset = !initialized || preference !== previousPreference;
      const next = new Map<string, boolean>();
      for (const section of sections) {
        next.set(
          section.key,
          !reset && expanded.value.has(section.key)
            ? expanded.value.get(section.key)!
            : expandAllByDefault || section.key === defaultSectionKey,
        );
      }
      // 阅读位置改变时只补展开所属卷，不清空用户手动展开的其他卷。
      if (
        currentSectionKey !== undefined &&
        (chapterId !== previousChapterId ||
          currentSectionKey !== previousSectionKey)
      ) {
        next.set(currentSectionKey, true);
      }
      expanded.value = next;
      initialized = toc.length > 0;
      previousPreference = preference;
      previousChapterId = chapterId;
      previousSectionKey = currentSectionKey;
    },
    { immediate: true, flush: 'sync' },
  );

  const items = computed<TocItem[]>(() =>
    normalized.value.map((item) =>
      item.kind === 'section'
        ? { ...item, expanded: expanded.value.get(item.key) ?? false }
        : item,
    ),
  );
  const visibleItems = computed<TocItem[]>(() => {
    const groups: TocItem[][] = [];
    let group: TocItem[] = [];
    let isExpanded = true;
    for (const item of items.value) {
      if (item.kind === 'section') {
        if (group.length) groups.push(group);
        group = [item];
        isExpanded = item.expanded;
      } else if (isExpanded) {
        group.push(item);
      }
    }
    if (group.length) groups.push(group);
    if (!toValue(options.sortReverse)) return groups.flat();
    return groups
      .reverse()
      .flatMap((entries) =>
        entries[0].kind === 'section'
          ? [entries[0], ...entries.slice(1).reverse()]
          : entries.reverse(),
      );
  });
  const currentChapter = computed(() =>
    normalized.value.find(
      (item): item is TocChapter =>
        item.kind === 'chapter' &&
        item.chapterId === toValue(options.currentChapterId),
    ),
  );
  const hasSections = computed(() => expanded.value.size > 0);
  const isAnyExpanded = computed(() =>
    [...expanded.value.values()].some(Boolean),
  );
  const toggleAll = () => {
    const value = !isAnyExpanded.value;
    expanded.value = new Map(
      [...expanded.value.keys()].map((key) => [key, value]),
    );
  };
  const toggleSection = (key: string) => {
    if (!expanded.value.has(key)) return;
    const next = new Map(expanded.value);
    next.set(key, !next.get(key));
    expanded.value = next;
  };

  return {
    items,
    visibleItems,
    currentChapter,
    hasSections,
    isAnyExpanded,
    toggleAll,
    toggleSection,
  };
}
