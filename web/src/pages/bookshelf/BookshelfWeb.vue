<script lang="ts" setup>
import { useListAutofocus } from '@/pages/list/useListAutofocus';
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { ChecklistOutlined } from '@vicons/material';
import { XAsyncContent, XPagination } from '@novelia/web-kit';

import { useIsWideScreen } from '@/pages/util';
import { WebNovelRepo } from '@/repos';
import { useSettingStore, useWhoamiStore } from '@/stores';
import {
  onUpdateListValue,
  onUpdatePage,
  parseWebListValueProvider,
} from '../list/option';
import type { WebFavoredListValue } from './option';
import { getWebFavoredListOptions, parseFavoredListValueSort } from './option';

const paginationScope = useTemplateRef<HTMLElement>('paginationScope');
useListAutofocus(paginationScope);

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
  favoredId: string;
}>();

const isWideScreen = useIsWideScreen();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const listOptions = getWebFavoredListOptions(
  whoami.value.hasNsfwAccess,
  setting.value.favoriteCreateTimeFirst,
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
    sort: parseFavoredListValueSort(listOptions.排序, listValue.value.排序),
  }),
);

const pageCount = computed(() => novelPage.value?.pageNumber ?? 1);

const showControlPanel = ref(false);

const novelListRef = useTemplateRef('novelList');
</script>

<template>
  <bookshelf-layout :menu-key="`web/${favoredId}`">
    <div
      ref="paginationScope"
      tabindex="0"
      role="region"
      aria-label="网络小说收藏列表"
    >
      <n-flex style="margin-bottom: 24px">
        <c-button
          label="选择"
          :icon="ChecklistOutlined"
          @action="showControlPanel = !showControlPanel"
        />
        <bookshelf-list-button
          v-if="!isWideScreen"
          :menu-key="`web/${favoredId}`"
        />
      </n-flex>

      <n-collapse-transition
        :show="showControlPanel"
        style="margin-bottom: 16px"
      >
        <bookshelf-web-control
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
        <NovelListWeb
          ref="novelList"
          :items="novelPage.items"
          :selectable="showControlPanel"
          :simple="!setting.showTagInWebFavored"
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
          <NovelListSkeleton :simple="!setting.showTagInWebFavored" />
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
