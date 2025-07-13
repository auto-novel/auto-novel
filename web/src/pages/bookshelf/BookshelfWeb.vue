<script lang="ts" setup>
import { ChecklistOutlined } from '@vicons/material';

import { Locator } from '@/data';
import { WebNovelOutlineDto } from '@/model/WebNovel';
import { runCatching } from '@/util/result';

import { useIsWideScreen } from '@/pages/util';
import NovelListWeb from '../list/components/NovelListWeb.vue';
import { Loader } from '../list/components/NovelPage.vue';

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
  favoredId: string;
}>();

const route = useRoute();

const isWideScreen = useIsWideScreen();

const { setting } = Locator.settingRepository();

const options = computed(() => [
  {
    label: '来源',
    tags: [
      'Kakuyomu',
      '成为小说家吧',
      'Novelup',
      'Hameln',
      'Pixiv',
      'Alphapolis',
    ],
    multiple: true,
  },
  {
    label: '类型',
    tags: ['全部', '连载中', '已完结', '短篇'],
  },
  {
    label: '分级',
    tags: ['全部', '一般向', 'R18'],
  },
  {
    label: '翻译',
    tags: ['全部', 'GPT', 'Sakura'],
  },
  {
    label: '排序',
    tags: setting.value.favoriteCreateTimeFirst
      ? ['收藏时间', '更新时间']
      : ['更新时间', '收藏时间'],
  },
]);

const loader = computed<Loader<WebNovelOutlineDto>>(() => {
  const { favoredId } = props;
  return (page, query, selected) => {
    if (query !== '') {
      document.title = '我的收藏 搜索：' + query;
    }
    const parseProviderBitFlags = (n: number): string => {
      const providerMap: { [key: string]: string } = {
        Kakuyomu: 'kakuyomu',
        成为小说家吧: 'syosetu',
        Novelup: 'novelup',
        Hameln: 'hameln',
        Pixiv: 'pixiv',
        Alphapolis: 'alphapolis',
      };
      return options.value[n].tags
        .filter((_, index) => (selected[n] & (1 << index)) !== 0)
        .map((tag) => providerMap[tag])
        .join();
    };

    const parseSort = (sortIndex: number): 'create' | 'update' => {
      const sortOption = (options.value.find((opt) => opt.label === '排序')
        ?.tags ?? [])[sortIndex];
      switch (sortOption) {
        case '收藏时间':
          return 'create';
        case '更新时间':
        default:
          return 'update';
      }
    };
    return runCatching(
      Locator.favoredRepository()
        .listFavoredWebNovel(favoredId, {
          page,
          pageSize: 30,
          query,
          provider: parseProviderBitFlags(0),
          type: selected[1],
          level: selected[2],
          translate: selected[3],
          sort: parseSort(selected[4]),
        })
        .then((it) => ({ type: 'web', ...it })),
    );
  };
});

const webSearchHistoryRepository = Locator.webSearchHistoryRepository();

const search = computed(() => {
  const searchHistory = webSearchHistoryRepository.ref.value;
  return {
    suggestions: searchHistory.queries,
    tags: searchHistory.tags
      .sort((a, b) => Math.log2(b.used) - Math.log2(a.used))
      .map((it) => it.tag)
      .slice(0, 8),
  };
});

watch(
  route,
  async (route) => {
    let query = '';
    if (typeof route.query.query === 'string') {
      query = route.query.query;
    }
    webSearchHistoryRepository.addHistory(query);
  },
  { immediate: true },
);

const showControlPanel = ref(false);

const novelListRef = ref<InstanceType<typeof NovelListWeb>>();
</script>

<template>
  <bookshelf-layout :menu-key="`web/${favoredId}`">
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

    <n-collapse-transition :show="showControlPanel" style="margin-bottom: 16px">
      <bookshelf-web-control
        :selected-novels="novelListRef!.selectedNovels"
        :favored-id="favoredId"
        @select-all="novelListRef!.selectAll()"
        @invert-selection="novelListRef!.invertSelection()"
      />
    </n-collapse-transition>

    <novel-page
      :page="page"
      :query="query"
      :selected="selected"
      :loader="loader"
      :options="options"
      :search="search"
      v-slot="{ items }"
    >
      <novel-list-web
        ref="novelListRef"
        :items="items"
        :selectable="showControlPanel"
        :simple="!setting.showTagInWebFavored"
      />
    </novel-page>
  </bookshelf-layout>
</template>
