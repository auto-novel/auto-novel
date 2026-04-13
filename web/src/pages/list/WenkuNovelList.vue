<script lang="ts" setup>
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
  <div class="layout-content">
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

    <CPage
      :page="page"
      :page-number="novelPage?.pageNumber"
      @update:page="onUpdatePage"
    >
      <template v-if="novelPage">
        <n-divider />
        <NovelListWenku :items="novelPage.items" />
        <n-empty v-if="novelPage.items.length === 0" description="空列表" />
        <n-divider />
      </template>

      <CResultX v-else :error="error" title="加载错误" />
    </CPage>
  </div>
</template>

<style scoped>
.n-card-header__main {
  text-overflow: ellipsis;
}
</style>
