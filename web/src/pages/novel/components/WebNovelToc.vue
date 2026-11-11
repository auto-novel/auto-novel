<script lang="ts" setup>
import {
  KeyboardArrowDownRound,
  KeyboardArrowUpRound,
  SortOutlined,
} from '@vicons/material';

import type { WebNovelDto } from '@/model/WebNovel';
import { useSettingStore } from '@/stores';
import { useTocExpansion } from './UseTocExpansion';
import { useLastReadChapter, useToc } from './UseWebNovel';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const sortReverse = computed(() => setting.value.tocSortReverse);

const { toc } = useToc(props.novel);
const { lastReadChapter } = useLastReadChapter(props.novel, toc);

const defaultTocExpanded = computed(() => setting.value.tocExpandAll);

const { expandedNames, hasSeparators, isAnyExpanded, toggleAll, tocSections } =
  useTocExpansion(
    toc,
    defaultTocExpanded,
    computed(() => props.novel.lastReadChapterId),
  );
</script>

<template>
  <section-header title="目录">
    <UButton
      color="neutral"
      v-if="hasSeparators"
      size="sm"
      style="margin-right: 8px"
      variant="ghost"
      class="text-sm/4"
      @click="toggleAll"
    >
      <component
        :is="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      {{ isAnyExpanded ? '折叠' : '展开' }}
    </UButton>
    <UButton
      color="neutral"
      size="sm"
      variant="ghost"
      class="text-sm/4"
      @click="setting.tocSortReverse = !setting.tocSortReverse"
    >
      <component
        :is="SortOutlined"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      {{ setting.tocSortReverse ? '倒序' : '正序' }}
    </UButton>
  </section-header>

  <UScrollArea class="min-h-0 flex-1 pr-4">
    <ChapterTocList
      :toc-sections="tocSections"
      v-model:expanded-names="expandedNames"
      :last-read-chapter-id="novel.lastReadChapterId"
      :default-scroll-key="lastReadChapter?.key"
      :provider-id="providerId"
      :novel-id="novelId"
      :sort-reverse="sortReverse"
      :mode="{
        narrow: false,
        modal: false,
        collapse: false,
      }"
    />
  </UScrollArea>
</template>
