<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { ChecklistOutlined } from '@vicons/material';
import { XPagination } from '@novelia/web-kit';

import { WebNovelRepo } from '@/repos';
import { useSettingStore, useWhoamiStore } from '@/stores';
import {
  onUpdateListValue,
  onUpdatePage,
  parseWebListValueProvider,
} from '../list/option';
import type { WebFavoredListValue } from './option';
import { getWebFavoredListOptions, parseFavoredListValueSort } from './option';

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
  favoredId: string;
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const listOptions = computed(() =>
  getWebFavoredListOptions(
    whoami.value.hasNsfwAccess,
    setting.value.favoriteCreateTimeFirst,
  ),
);

const listValue = computed(
  () =>
    <WebFavoredListValue>{
      搜索: props.query,
      来源: props.selected[0] ?? 0xff,
      类型: props.selected[1] ?? 0,
      分级: props.selected[2] ?? 0,
      翻译: props.selected[3] ?? 0,
      排序: props.selected[4] ?? 0,
    },
);

const { data: novelPage, error } = WebNovelRepo.useWebNovelFavoredList(
  () => props.page,
  () => props.favoredId,
  () => ({
    query: listValue.value.搜索,
    provider: parseWebListValueProvider(listValue.value.来源),
    type: listValue.value.类型,
    level: listValue.value.分级,
    translate: listValue.value.翻译,
    sort: parseFavoredListValueSort(
      listOptions.value.排序,
      listValue.value.排序,
    ),
  }),
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);

const showControlPanel = ref(false);

const novelListRef = useTemplateRef('novelList');
</script>

<template>
  <div role="region" aria-label="网络小说收藏列表">
    <div class="mb-6">
      <UButton
        :icon="ChecklistOutlined"
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="showControlPanel = !showControlPanel"
      >
        选择
      </UButton>
    </div>

    <UCollapsible v-model:open="showControlPanel">
      <template #content>
        <div class="pb-4">
          <bookshelf-web-control
            :selected-novels="novelListRef?.selectedNovels ?? []"
            :favored-id="favoredId"
            @select-all="novelListRef?.selectAll()"
            @invert-selection="novelListRef?.invertSelection()"
          />
        </div>
      </template>
    </UCollapsible>

    <ListFilter
      :options="listOptions"
      :value="listValue"
      @update:value="onUpdateListValue(listOptions, $event)"
    />

    <XPagination
      v-if="pageCount > 1"
      class="mt-6"
      :ui="{ root: 'border-t-0 p-0 sm:px-0' }"
      :page="page"
      :total-pages="pageCount"
      @update:page="onUpdatePage"
    />

    <USeparator class="mx-0 mb-0" :class="pageCount > 1 ? 'mt-3' : 'mt-6'" />

    <NovelListSkeleton
      v-if="!novelPage && !error"
      :simple="!setting.showTagInWebFavored"
    />
    <UAlert
      color="error"
      variant="soft"
      v-else-if="!novelPage && error"
      title="加载错误"
      :description="error.message"
    />
    <CEmpty
      v-else-if="novelPage && novelPage.items.length === 0"
      class="mt-3"
      title="空列表"
    />
    <template v-else-if="novelPage">
      <NovelListWeb
        ref="novelList"
        :items="novelPage.items"
        :selectable="showControlPanel"
        :simple="!setting.showTagInWebFavored"
      />
    </template>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </div>
</template>
