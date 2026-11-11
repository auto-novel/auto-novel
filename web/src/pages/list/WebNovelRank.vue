<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { XPagination, XPage } from '@novelia/web-kit';

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
  <XPage role="region" aria-label="小说排行榜">
    <UPageHeader :title="title" />

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

    <USeparator :style="{ margin: pageCount > 1 ? '12px 0 0' : '24px 0 0' }" />

    <NovelListSkeleton v-if="!novelPage && !error" />
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
      <NovelListWeb :items="novelPage.items" />
    </template>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </XPage>
</template>
