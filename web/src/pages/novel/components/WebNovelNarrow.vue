<script lang="ts" setup>
import { KeyboardArrowDownRound } from '@vicons/material';

import { subjectKeys } from '@/api/commentSubject';
import type { TocChapter } from '@/components/useChapterToc';
import { useChapterToc } from '@/components/useChapterToc';
import type { WebNovelDto, WebNovelTocItemDto } from '@/model/WebNovel';
import { useSettingStore } from '@/stores';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const {
  items,
  visibleItems,
  currentChapter: lastReadChapter,
  hasSections,
  isAnyExpanded,
  toggleAll,
  toggleSection,
} = useChapterToc(() => props.novel.toc, {
  defaultExpanded: () => setting.value.tocExpandAll,
  currentChapterId: () => props.novel.lastReadChapterId,
  sortReverse: () => setting.value.tocSortReverse,
});
const startReadChapter = computed(
  () =>
    lastReadChapter.value ??
    items.value.find((item) => item.kind === 'chapter'),
);
const chapterTo = (chapter: TocChapter) =>
  `/novel/${props.providerId}/${props.novelId}/${chapter.chapterId}`;
const showCatalogDrawer = ref(false);
</script>

<template>
  <web-novel-metadata
    :provider-id="providerId"
    :novel-id="novelId"
    :novel="novel"
  />

  <USeparator class="my-6" />

  <web-translate
    :provider-id="providerId"
    :novel-id="novelId"
    :title-jp="novel.titleJp"
    :title-zh="novel.titleZh"
    :total="novel.toc.filter((it: WebNovelTocItemDto) => it.chapterId).length"
    v-model:jp="novel.jp"
    v-model:youdao="novel.youdao"
    v-model:gpt="novel.gpt"
    :sakura="novel.sakura"
    :glossary="novel.glossary"
  />

  <USeparator class="my-6" />

  <template v-if="setting.tocCollapseInNarrowScreen">
    <ChapterTocItem
      v-if="startReadChapter !== undefined"
      :item="startReadChapter"
      :to="chapterTo(startReadChapter)"
      :current-chapter-id="novel.lastReadChapterId"
    />
    <div v-if="novel.toc.length > 1" class="flex justify-center">
      <UButton
        :trailing-icon="KeyboardArrowDownRound"
        :ui="{ trailingIcon: 'ml-1 size-4 shrink-0' }"
        variant="link"
        color="primary"
        class="min-h-7 gap-0 px-3 py-0 pointer-coarse:min-h-11"
        @click="showCatalogDrawer = true"
      >
        展开目录
      </UButton>
    </div>
  </template>
  <template v-else>
    <ChapterTocToolbar
      v-model:reverse="setting.tocSortReverse"
      :has-sections="hasSections"
      :is-any-expanded="isAnyExpanded"
      class="mb-4 justify-end"
      @toggle-all="toggleAll"
    />
    <UCard
      v-if="lastReadChapter !== undefined"
      variant="soft"
      class="mb-2 bg-embedded text-sm leading-[1.6] text-default"
      :ui="{ body: 'px-0 pt-1.5 pb-0 sm:px-0 sm:pt-1.5 sm:pb-0' }"
    >
      <b class="pl-1.5">上次读到:</b>
      <ChapterTocItem
        :item="lastReadChapter"
        :to="chapterTo(lastReadChapter)"
        :current-chapter-id="novel.lastReadChapterId"
      />
    </UCard>
    <!-- 整页滚动没有独立视口，不伪装成限高虚拟列表；各行按需跳过绘制。 -->
    <ChapterTocList
      :items="visibleItems"
      :chapter-to="chapterTo"
      :current-chapter-id="novel.lastReadChapterId"
      :virtual="false"
      @toggle-section="toggleSection"
    />
  </template>

  <USlideover
    v-if="setting.tocCollapseInNarrowScreen && novel.toc.length > 1"
    v-model:open="showCatalogDrawer"
    title="目录"
    :close="false"
    side="right"
    :content="{ onOpenAutoFocus: (event: Event) => event.preventDefault() }"
    :ui="{
      content: 'w-80 max-w-[calc(100vw-3rem)]',
      body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0',
    }"
  >
    <template #actions>
      <ChapterTocToolbar
        v-model:reverse="setting.tocSortReverse"
        :has-sections="hasSections"
        :is-any-expanded="isAnyExpanded"
        @toggle-all="toggleAll"
      />
    </template>

    <template #body>
      <ChapterTocList
        :items="visibleItems"
        :chapter-to="chapterTo"
        :current-chapter-id="novel.lastReadChapterId"
        :initial-chapter-id="novel.lastReadChapterId"
        class="min-h-0 flex-1"
        padded
        @toggle-section="toggleSection"
      />
    </template>
  </USlideover>

  <section v-if="!setting.hideCommmentWebNovel" class="mt-6">
    <comment-list :site="subjectKeys.novel.web(providerId, novelId)" />
  </section>
</template>
