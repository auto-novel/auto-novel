<script lang="ts" setup>
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
  <div class="layout-content">
    <n-h1>网络小说</n-h1>

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
