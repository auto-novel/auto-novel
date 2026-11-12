<script lang="ts" setup>
import {
  KeyboardArrowDownRound,
  KeyboardArrowUpRound,
  SortOutlined,
} from '@vicons/material';

import { subjectKeys } from '@/api/commentSubject';
import { GenericNovelId } from '@/model/Common';
import type { WebNovelDto, WebNovelTocItemDto } from '@/model/WebNovel';
import NovelBottomTabs from '@/pages/novel/components/NovelBottomTabs.vue';
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

const defaultTocExpanded = computed(() => setting.value.tocExpandAll);

const { toc } = useToc(props.novel);
const { lastReadChapter } = useLastReadChapter(props.novel, toc);
const startReadChapter = computed(() => {
  if (lastReadChapter.value !== undefined) {
    return lastReadChapter.value;
  }
  return toc.value.find((it) => it.chapterId !== undefined);
});

const showCatalogDrawer = ref(false);

const { expandedNames, hasSeparators, isAnyExpanded, toggleAll, tocSections } =
  useTocExpansion(
    toc,
    defaultTocExpanded,
    computed(() => props.novel.lastReadChapterId),
  );
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
      :provider-id="providerId"
      :novel-id="novelId"
      :toc-item="startReadChapter"
      :last-read="novel.lastReadChapterId"
      :is-separator="false"
      :is-special-chapter="true"
    />
    <UButton
      color="neutral"
      v-if="novel.toc.length > 1"
      variant="soft"
      class="w-full rounded-full"
      @click="showCatalogDrawer = true"
    >
      展开目录
    </UButton>
  </template>
  <template v-else>
    <div class="mb-4 flex items-center justify-between">
      <div class="flex-1"></div>
      <UButton
        :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
        color="neutral"
        v-if="hasSeparators"
        size="sm"
        variant="ghost"
        class="mr-2 text-sm/4"
        @click="toggleAll"
      >
        {{ isAnyExpanded ? '折叠' : '展开' }}
      </UButton>
      <UButton
        :icon="SortOutlined"
        color="neutral"
        size="sm"
        variant="ghost"
        class="text-sm/4"
        @click="setting.tocSortReverse = !setting.tocSortReverse"
      >
        {{ setting.tocSortReverse ? '倒序' : '正序' }}
      </UButton>
    </div>
    <UCard
      v-if="lastReadChapter !== undefined"
      variant="soft"
      class="mb-2 bg-embedded text-sm leading-[1.6] text-ink"
      :ui="{ body: 'px-0 pt-1.5 pb-0 sm:px-0 sm:pt-1.5 sm:pb-0' }"
    >
      <b class="pl-1.5">上次读到:</b>
      <ChapterTocItem
        :provider-id="providerId"
        :novel-id="novelId"
        :toc-item="lastReadChapter"
        :last-read="novel.lastReadChapterId"
        :is-separator="false"
        :is-special-chapter="true"
      />
    </UCard>
    <UScrollArea>
      <ChapterTocList
        :toc-sections="tocSections"
        v-model:expanded-names="expandedNames"
        :last-read-chapter-id="novel.lastReadChapterId"
        :default-scroll-key="lastReadChapter?.key"
        :provider-id="providerId"
        :novel-id="novelId"
        :sort-reverse="sortReverse"
        :mode="{
          narrow: true,
          modal: false,
          collapse: false,
        }"
      />
    </UScrollArea>
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
      <UButton
        :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
        color="neutral"
        v-if="hasSeparators"
        size="sm"
        variant="ghost"
        class="mr-2 text-sm/4"
        @click="toggleAll"
      >
        {{ isAnyExpanded ? '折叠' : '展开' }}
      </UButton>
      <UButton
        :icon="SortOutlined"
        color="neutral"
        size="sm"
        variant="ghost"
        class="text-sm/4"
        @click="setting.tocSortReverse = !setting.tocSortReverse"
      >
        {{ setting.tocSortReverse ? '倒序' : '正序' }}
      </UButton>
    </template>

    <template #body>
      <div class="min-h-0 flex-1 py-4 pr-4 pl-2">
        <ChapterTocList
          :toc-sections="tocSections"
          v-model:expanded-names="expandedNames"
          :last-read-chapter-id="novel.lastReadChapterId"
          :default-scroll-key="lastReadChapter?.key"
          :provider-id="providerId"
          :novel-id="novelId"
          :sort-reverse="sortReverse"
          :mode="{
            narrow: true,
            modal: false,
            collapse: true,
          }"
          class="h-full"
        />
      </div>
    </template>
  </USlideover>

  <NovelBottomTabs
    :gnid="GenericNovelId.web(providerId, novelId)"
    :glossary="novel.glossary"
    :site="subjectKeys.novel.web(providerId, novelId)"
    :hide-comment="setting.hideCommmentWebNovel"
    :locked="false"
  />
</template>
