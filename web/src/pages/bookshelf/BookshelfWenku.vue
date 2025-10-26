<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

import { useIsWideScreen } from '@/pages/util';
import { WenkuNovelRepo } from '@/repos';
import { useSettingStore } from '@/stores';
import { onUpdateListValue, onUpdatePage } from '../list/option';
import type { WenkuFavoredListValue } from './option';
import {
  getWenkuFavoredListOptions,
  parseFavoredListValueSort,
} from './option';

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

const showControlPanel = ref(false);

const novelListRef = useTemplateRef('novelList');
</script>

<template>
  <bookshelf-layout :menu-key="`wenku/${favoredId}`">
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

    <n-collapse-transition :show="showControlPanel" style="margin-bottom: 16px">
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

    <CPage
      :page="page"
      :page-number="novelPage?.pageNumber"
      @update:page="onUpdatePage"
    >
      <template v-if="novelPage">
        <n-divider />
        <NovelListWenku
          ref="novelList"
          :items="novelPage.items"
          :selectable="showControlPanel"
          simple
        />
        <n-empty v-if="novelPage.items.length === 0" description="空列表" />
        <n-divider />
      </template>

      <CResultX v-else :error="error" title="加载错误" />
    </CPage>
  </bookshelf-layout>
</template>
