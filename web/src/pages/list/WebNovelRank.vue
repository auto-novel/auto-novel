<script lang="ts" setup>
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
</script>

<template>
  <div class="layout-content">
    <n-h1>{{ title }}</n-h1>

    <ListFilter
      :options="listOptions"
      :value="listValue"
      @update:value="onUpdateListValue(listOptions, $event)"
    />

    <CPage
      :page="page"
      :page-number="novelPage?.pageNumber"
      @update:page="onUpdatePage"
    >
      <template v-if="novelPage">
        <n-divider />
        <NovelListWeb :items="novelPage.items" />
        <n-empty v-if="novelPage.items.length === 0" description="空列表" />
        <n-divider />
      </template>

      <CResultX v-else :error="error" title="加载错误" />
    </CPage>
  </div>
</template>
