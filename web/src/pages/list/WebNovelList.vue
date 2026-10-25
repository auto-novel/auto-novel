<script lang="ts" setup>
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { XAsyncContent, XPagination, XSeparator } from '@novelia/web-kit';

import { WebNovelRepo } from '@/repos';
import { FavoredRepo, useWhoamiStore } from '@/stores';
import type { WebListValue } from './option';
import {
  getWebListOptions,
  onUpdateListValue,
  onUpdatePage,
  parseWebListValueProvider,
} from './option';

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const listOptions = getWebListOptions(whoami.value.hasNsfwAccess);

const listValue = computed(
  () =>
    <WebListValue>{
      搜索: props.query,
      来源: props.selected[0] ?? 0xff,
      类型: props.selected[1] ?? 0,
      分级: props.selected[2] ?? (whoami.value.hasNsfwAccess ? 0 : 1),
      翻译: props.selected[3] ?? 0,
      排序: props.selected[4] ?? 0,
    },
);

const { data: novelPage, error } = WebNovelRepo.useWebNovelList(
  () => props.page,
  () => ({
    query: listValue.value.搜索,
    provider: parseWebListValueProvider(listValue.value.来源),
    type: listValue.value.类型,
    level: listValue.value.分级,
    translate: listValue.value.翻译,
    sort: listValue.value.排序,
  }),
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);

watch(novelPage, (novelPage) => {
  if (novelPage) {
    const favoredIds = favoreds.value.web.map((it) => it.id);
    for (const item of novelPage.items) {
      if (item.favored && !favoredIds.includes(item.favored)) {
        item.favored = undefined;
      }
    }
  }
});
</script>

<template>
  <div role="region" aria-label="网络小说列表" class="layout-content">
    <n-h1>网络小说</n-h1>

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

    <XSeparator :style="{ margin: pageCount > 1 ? '12px 0 0' : '24px 0 0' }" />

    <template v-if="novelPage">
      <NovelListWeb :items="novelPage.items" />
      <n-empty
        v-if="novelPage.items.length === 0"
        class="mt-3"
        description="空列表"
      />
    </template>

    <XAsyncContent
      v-else
      :loading="!error"
      :error="error?.message ?? ''"
      error-title="加载错误"
    >
      <template #loading>
        <NovelListSkeleton />
      </template>
    </XAsyncContent>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </div>
</template>
