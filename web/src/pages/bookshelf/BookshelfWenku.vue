<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import NovelGridSkeleton from '@/components/NovelGridSkeleton.vue';
import { ChecklistOutlined } from '@vicons/material';
import { XPagination } from '@novelia/web-kit';

import { WenkuNovelRepo } from '@/repos';
import { useSettingStore } from '@/stores';
import { onUpdateListValue, onUpdatePage } from '../list/option';
import type { WenkuFavoredListValue } from './option';
import {
  getWenkuFavoredListOptions,
  parseFavoredListValueSort,
} from './option';

const props = defineProps<{
  page: number;
  selected: number[];
  favoredId: string;
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const listOptions = computed(() =>
  getWenkuFavoredListOptions(setting.value.favoriteCreateTimeFirst),
);

const listValue = computed(
  () =>
    <WenkuFavoredListValue>{
      排序: props.selected[0] ?? 0,
    },
);

const { data: novelPage, error } = WenkuNovelRepo.useWenkuNovelFavoredList(
  () => props.page,
  () => props.favoredId,
  () => ({
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
  <div role="region" aria-label="文库小说收藏列表">
    <div class="mb-6">
      <UButton
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="showControlPanel = !showControlPanel"
      >
        <component
          :is="ChecklistOutlined"
          class="size-4.5 shrink-0"
          aria-hidden="true"
        />
        选择
      </UButton>
    </div>

    <n-collapse-transition :show="showControlPanel" style="margin-bottom: 16px">
      <bookshelf-wenku-control
        :selected-novels="novelListRef?.selectedNovels ?? []"
        :favored-id="favoredId"
        @select-all="novelListRef?.selectAll()"
        @invert-selection="novelListRef?.invertSelection()"
      />
    </n-collapse-transition>

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

    <USeparator
      :style="{ margin: pageCount > 1 ? '12px 0 12px' : '24px 0 12px' }"
    />

    <NovelGridSkeleton v-if="!novelPage && !error" />
    <UAlert
      color="error"
      variant="soft"
      v-else-if="!novelPage && error"
      title="加载错误"
      :description="error.message"
    />
    <CEmpty
      v-else-if="novelPage && novelPage.items.length === 0"
      title="空列表"
    />
    <template v-else-if="novelPage">
      <NovelListWenku
        ref="novelList"
        :items="novelPage.items"
        :selectable="showControlPanel"
        simple
      />
    </template>

    <XPagination
      v-if="pageCount > 1"
      class="mt-3"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </div>
</template>
