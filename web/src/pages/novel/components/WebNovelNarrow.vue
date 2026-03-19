<script lang="ts" setup>
import {
  KeyboardArrowDownRound,
  KeyboardArrowUpRound,
  SortOutlined,
} from '@vicons/material';
import { NScrollbar } from 'naive-ui';

import type { WebNovelDto, WebNovelTocItemDto } from '@/model/WebNovel';
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

  <n-divider />

  <web-translate
    :provider-id="providerId"
    :novel-id="novelId"
    :title-jp="novel.titleJp"
    :title-zh="novel.titleZh"
    :total="novel.toc.filter((it: WebNovelTocItemDto) => it.chapterId).length"
    v-model:jp="novel.jp"
    v-model:baidu="novel.baidu"
    v-model:youdao="novel.youdao"
    v-model:gpt="novel.gpt"
    :sakura="novel.sakura"
    :murasaki="novel.murasaki"
    :glossary="novel.glossary"
  />

  <n-divider />

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
    <c-button
      v-if="novel.toc.length > 1"
      secondary
      label="展开目录"
      @action="showCatalogDrawer = true"
      style="width: 100%"
    />
  </template>
  <template v-else>
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      "
    >
      <div style="flex: 1"></div>
      <c-button
        v-if="hasSeparators"
        :label="isAnyExpanded ? '折叠' : '展开'"
        :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
        quaternary
        size="small"
        :round="false"
        @action="toggleAll"
        style="margin-right: 8px"
      />
      <c-button
        :label="setting.tocSortReverse ? '倒序' : '正序'"
        :icon="SortOutlined"
        quaternary
        size="small"
        :round="false"
        @action="setting.tocSortReverse = !setting.tocSortReverse"
      />
    </div>
    <n-card
      v-if="lastReadChapter !== undefined"
      :bordered="false"
      embedded
      style="margin-bottom: 8px"
      content-style="padding: 6px 0px 0px;"
    >
      <b style="padding-left: 6px">上次读到:</b>
      <ChapterTocItem
        :provider-id="providerId"
        :novel-id="novelId"
        :toc-item="lastReadChapter"
        :last-read="novel.lastReadChapterId"
        :is-separator="false"
        :is-special-chapter="true"
      />
    </n-card>
    <n-scrollbar>
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
    </n-scrollbar>
  </template>

  <c-drawer-right
    v-if="setting.tocCollapseInNarrowScreen && novel.toc.length > 1"
    :width="320"
    v-model:show="showCatalogDrawer"
    title="目录"
  >
    <template #action>
      <c-button
        v-if="hasSeparators"
        :label="isAnyExpanded ? '折叠' : '展开'"
        :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
        quaternary
        size="small"
        :round="false"
        @action="toggleAll"
        style="margin-right: 8px"
      />
      <c-button
        :label="setting.tocSortReverse ? '倒序' : '正序'"
        :icon="SortOutlined"
        quaternary
        size="small"
        :round="false"
        @action="setting.tocSortReverse = !setting.tocSortReverse"
      />
    </template>

    <div style="flex: 1; min-height: 0; padding: 16px 16px 16px 8px">
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
        style="height: 100%"
      />
    </div>
  </c-drawer-right>

  <comment-list
    v-if="!setting.hideCommmentWebNovel"
    :site="`web-${providerId}-${novelId}`"
    :locked="false"
  />
</template>
