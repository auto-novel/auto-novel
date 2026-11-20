<script lang="ts" setup>
import type { TocChapter } from '@/components/useChapterToc';
import { useChapterToc } from '@/components/useChapterToc';
import type { WebNovelDto } from '@/model/WebNovel';
import { useSettingStore } from '@/stores';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const { setting } = storeToRefs(useSettingStore());
const { visibleItems, hasSections, isAnyExpanded, toggleAll, toggleSection } =
  useChapterToc(() => props.novel.toc, {
    defaultExpanded: () => setting.value.tocExpandAll,
    currentChapterId: () => props.novel.lastReadChapterId,
    sortReverse: () => setting.value.tocSortReverse,
  });
const chapterTo = (chapter: TocChapter) =>
  `/novel/${props.providerId}/${props.novelId}/${chapter.chapterId}`;
</script>

<template>
  <section-header title="目录">
    <ChapterTocToolbar
      v-model:reverse="setting.tocSortReverse"
      :has-sections="hasSections"
      :is-any-expanded="isAnyExpanded"
      @toggle-all="toggleAll"
    />
  </section-header>
  <ChapterTocList
    :items="visibleItems"
    :chapter-to="chapterTo"
    :current-chapter-id="novel.lastReadChapterId"
    :initial-chapter-id="novel.lastReadChapterId"
    class="min-h-0 flex-1 pr-4"
    @toggle-section="toggleSection"
  />
</template>
