<script lang="ts" setup>
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { XAsyncContent, XPagination } from '@novelia/web-kit';

import type { ListOptions, ListValue } from '@/components/list/types';
import { WebNovelRepo } from '@/repos';
import {
  getWebRankListOptions,
  onUpdateListValue,
  onUpdatePage,
  parseRankListValue,
} from './option';

const paginationScope = useTemplateRef<HTMLElement>('paginationScope');

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

const pageCount = computed(() => novelPage.value?.pageNumber ?? 1);
</script>

<template>
  <div
    ref="paginationScope"
    tabindex="0"
    role="region"
    aria-label="小说排行榜"
    class="layout-content"
  >
    <n-h1>{{ title }}</n-h1>

    <ListFilter
      :options="listOptions"
      :value="listValue"
      @update:value="onUpdateListValue(listOptions, $event)"
    />

    <template v-if="novelPage">
      <n-divider />
      <NovelListWeb :items="novelPage.items" />
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
        <NovelListSkeleton />
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
</template>
