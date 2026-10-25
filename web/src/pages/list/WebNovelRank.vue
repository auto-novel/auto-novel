<script lang="ts" setup>
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { XAsyncContent, XPagination, XSeparator } from '@novelia/web-kit';

import type { ListOptions, ListValue } from '@/components/list/types';
import { WebNovelRepo } from '@/repos';
import {
  getWebRankListOptions,
  onUpdateListValue,
  onUpdatePage,
  parseRankListValue,
} from './option';

const props = defineProps<{
  providerId: string;
  typeId: string;
  page: number;
  selected: number[];
}>();

const descriptor = computed(() =>
  getWebRankListOptions(props.providerId, props.typeId),
);

const title = computed(() => descriptor.value.title);
const listOptions = computed(() => descriptor.value.listOptions);

const listValue = computed(
  () =>
    Object.fromEntries(
      Object.entries(listOptions.value).map(([label], idx) => [
        label,
        props.selected[idx] ?? 0,
      ]),
    ) as ListValue<ListOptions>,
);

const { data: novelPage, error } = WebNovelRepo.useWebNovelRankList(
  () => props.providerId,
  () =>
    parseRankListValue(
      props.providerId,
      props.typeId,
      props.page,
      listValue.value,
    ),
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);
</script>

<template>
  <div role="region" aria-label="小说排行榜" class="layout-content">
    <n-h1>{{ title }}</n-h1>

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
