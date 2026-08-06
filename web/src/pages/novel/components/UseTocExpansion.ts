import type { ReadableTocItem } from '@/pages/novel/components/common';
import { checkIsMobile } from '@/util';

interface TocSection {
  separator: ReadableTocItem | null;
  chapters: ReadableTocItem[];
}

export function useTocExpansion(
  toc:
    | Ref<ReadableTocItem[] | undefined>
    | ComputedRef<ReadableTocItem[] | undefined>,
  defaultExpanded: Ref<boolean> | ComputedRef<boolean>,
  lastReadChapterId: Ref<string | undefined> | ComputedRef<string | undefined>,
) {
  const expandedNames = ref<string[]>([]);

  const separatorKeys = computed(() => {
    if (!toc.value) return [];
    return toc.value
      .filter((item) => item.order === undefined)
      .map((item) => item.titleJp);
  });

  const tocSections = computed<TocSection[]>(() => {
    if (!toc.value) {
      return [];
    }
    const sections: TocSection[] = [];
    let currentSection: TocSection = { separator: null, chapters: [] };

    for (const item of toc.value) {
      if (item.order === undefined) {
        if (currentSection.separator || currentSection.chapters.length > 0) {
          sections.push(currentSection);
        }
        currentSection = { separator: item, chapters: [] };
      } else {
        currentSection.chapters.push(item);
      }
    }
    sections.push(currentSection);

    return sections;
  });

  const isMobile = checkIsMobile();
  const maxChaptersAllowingExpansion = isMobile ? 1000 : 3000;

  watch(
    [separatorKeys, defaultExpanded, tocSections, lastReadChapterId],
    ([keys, expandedDefault, sections, lastReadId]) => {
      if (
        !expandedDefault ||
        !toc.value ||
        toc.value.length > maxChaptersAllowingExpansion
      ) {
        if (sections.length > 0) {
          let targetSectionKey: string | undefined = undefined;

          if (lastReadId) {
            const sectionContainingLastRead = sections.find((section) =>
              section.chapters.some(
                (chapter) => chapter.chapterId === lastReadId,
              ),
            );
            if (sectionContainingLastRead?.separator) {
              targetSectionKey = sectionContainingLastRead.separator.titleJp;
            }
          }

          if (!targetSectionKey) {
            const firstSectionWithSeparator = sections.find(
              (section) => section.separator,
            );
            if (firstSectionWithSeparator?.separator) {
              targetSectionKey = firstSectionWithSeparator.separator.titleJp;
            }
          }

          if (targetSectionKey) {
            expandedNames.value = [targetSectionKey];
          } else {
            expandedNames.value = [];
          }
        } else {
          expandedNames.value = [];
        }
      } else {
        expandedNames.value = [...keys];
      }
    },
    { immediate: true },
  );

  const hasSeparators = computed(() => {
    return separatorKeys.value.length > 0;
  });

  const isAnyExpanded = computed(() => {
    return expandedNames.value.length > 0;
  });

  const toggleAll = () => {
    if (!toc.value) return;
    if (isAnyExpanded.value) {
      expandedNames.value = [];
    } else {
      expandedNames.value = [...separatorKeys.value];
    }
  };

  return {
    expandedNames,
    hasSeparators,
    isAnyExpanded,
    toggleAll,
    tocSections,
  };
}
