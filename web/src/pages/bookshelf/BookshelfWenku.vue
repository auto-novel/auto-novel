<script lang="ts" setup>
import { useListAutofocus } from '@/pages/list/useListAutofocus';
import NovelGridSkeleton from '@/components/NovelGridSkeleton.vue';
import { ChecklistOutlined } from '@vicons/material';
import { XAsyncContent, XPagination } from '@novelia/web-kit';

import { useIsWideScreen } from '@/pages/util';
import { WenkuNovelRepo } from '@/repos';
import { useSettingStore } from '@/stores';
import { onUpdateListValue, onUpdatePage } from '../list/option';
import type { WenkuFavoredListValue } from './option';
import {
  getWenkuFavoredListOptions,
  parseFavoredListValueSort,
} from './option';

const paginationScope = useTemplateRef<HTMLElement>('paginationScope');
useListAutofocus(paginationScope);

const props = defineProps<{
  page: number;
  selected: number[];
  favoredId: string;
}>();

const isWideScreen = useIsWideScreen();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const listOptions = getWenkuFavoredListOptions(
  setting.value.favoriteCreateTimeFirst,
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
    sort: parseFavoredListValueSort(listOptions.排序, listValue.value.排序),
  }),
);

const pageCount = computed(() => novelPage.value?.pageNumber ?? 1);

const showControlPanel = ref(false);

const novelListRef = useTemplateRef('novelList');
</script>

<template>
  <bookshelf-layout :menu-key="`wenku/${favoredId}`">
    <div
      ref="paginationScope"
      tabindex="0"
      role="region"
      aria-label="文库小说收藏列表"
    >
      <n-flex style="margin-bottom: 24px">
        <c-button
          label="选择"
          :icon="ChecklistOutlined"
          @action="showControlPanel = !showControlPanel"
        />
        <bookshelf-list-button
          v-if="!isWideScreen"
          :menu-key="`wenku/${favoredId}`"
        />
      </n-flex>

      <n-collapse-transition
        :show="showControlPanel"
        style="margin-bottom: 16px"
      >
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

      <template v-if="novelPage">
        <n-divider />
        <NovelListWenku
          ref="novelList"
          :items="novelPage.items"
          :selectable="showControlPanel"
          simple
        />
        <n-empty v-if="novelPage.items.length === 0" description="空列表" />
      </template>

      <XAsyncContent
        v-else
        :loading="!error"
        :error="error?.message ?? ''"
        error-title="加载错误"
      >
        <template #loading>
          <n-divider />
          <NovelGridSkeleton />
        </template>
      </XAsyncContent>

      <XPagination
        v-if="pageCount > 1"
        :page="page"
        :total-pages="pageCount"
        keyboard
        :keyboard-scope="paginationScope"
        @update:page="onUpdatePage"
      />
    </div>
  </bookshelf-layout>
</template>
