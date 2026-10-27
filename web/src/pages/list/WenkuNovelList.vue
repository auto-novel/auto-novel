<script lang="ts" setup>
import NovelGridSkeleton from '@/components/NovelGridSkeleton.vue';
import { XEmpty, XError, XPagination, XSeparator } from '@novelia/web-kit';
import { PlusOutlined } from '@vicons/material';

import { WenkuNovelRepo } from '@/repos';
import { FavoredRepo, useWhoamiStore } from '@/stores';
import type { WenkuListValue } from './option';
import { getWenkuListOptions, onUpdateListValue, onUpdatePage } from './option';

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const listOptions = getWenkuListOptions(whoami.value.hasNsfwAccess);

const listValue = computed(
  () =>
    <WenkuListValue>{
      搜索: props.query,
      分级: props.selected[0] ?? 0,
    },
);

const { data: novelPage, error } = WenkuNovelRepo.useWenkuNovelList(
  () => props.page,
  () => ({
    query: listValue.value.搜索,
    level: listValue.value.分级,
  }),
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);

watch(novelPage, (novelPage) => {
  if (novelPage) {
    const favoredIds = favoreds.value.wenku.map((it) => it.id);
    for (const item of novelPage.items) {
      if (item.favored && !favoredIds.includes(item.favored)) {
        item.favored = undefined;
      }
    }
  }
});
</script>

<template>
  <div role="region" aria-label="文库小说列表" class="layout-content">
    <n-h1>文库小说</n-h1>

    <router-link v-if="whoami.hasNovelAccess" to="/wenku-edit">
      <c-button
        label="新建小说"
        :icon="PlusOutlined"
        style="margin-bottom: 8px"
      />
    </router-link>

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

    <XSeparator
      :style="{ margin: pageCount > 1 ? '12px 0 12px' : '24px 0 12px' }"
    />

    <NovelGridSkeleton v-if="!novelPage && !error" />
    <XError
      v-else-if="!novelPage && error"
      title="加载错误"
      :description="error.message"
    />
    <XEmpty
      v-else-if="novelPage && novelPage.items.length === 0"
      title="空列表"
      size="compact"
    />
    <template v-else-if="novelPage">
      <NovelListWenku :items="novelPage.items" />
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

<style scoped>
.n-card-header__main {
  text-overflow: ellipsis;
}
</style>
