<script lang="ts" setup>
import { XDrawer, XPage, XPageHeader, XScrollArea } from '@novelia/web-kit';
import { ExpandMoreOutlined } from '@vicons/material';

import { useIsWideScreen } from '@/pages/util';
import { FavoredRepo } from '@/stores';
import BookshelfLocal from './BookshelfLocal.vue';
import BookshelfWeb from './BookshelfWeb.vue';
import BookshelfWenku from './BookshelfWenku.vue';

const props = defineProps<{
  type: 'web' | 'wenku' | 'local';
  favoredId: string;
  page: number;
  query: string;
  selected: number[];
}>();

const menuKey = computed(() => `${props.type}/${props.favoredId}`);
const favoredStore = FavoredRepo.useFavoredStore();
const favoredTitle = computed(() => {
  const typeLabel = { web: '网络', wenku: '文库', local: '本地' }[props.type];
  const title =
    props.favoredId === 'all'
      ? '全部收藏'
      : favoredStore.favoreds[props.type].find(
          (it) => it.id === props.favoredId,
        )?.title ?? '收藏夹';
  return `${typeLabel}：${title}`;
});

const isWideScreen = useIsWideScreen();
const showListDrawer = ref(false);

watch([menuKey, isWideScreen], () => {
  showListDrawer.value = false;
});
</script>

<template>
  <XPage>
    <XPageHeader :title="favoredTitle">
      <template v-if="!isWideScreen" #title>
        <XDrawer
          v-model:open="showListDrawer"
          title="收藏夹"
          show-header
          side="right"
          size="clamp(280px, 80vw, 800px)"
        >
          <template #trigger>
            <button
              type="button"
              class="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left [font:inherit] text-inherit focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              :aria-label="`切换收藏夹，当前：${favoredTitle}`"
            >
              <span class="min-w-0 truncate">{{ favoredTitle }}</span>
              <ExpandMoreOutlined class="size-6 shrink-0" aria-hidden="true" />
            </button>
          </template>
          <template #action>
            <BookshelfAddButton />
          </template>
          <XScrollArea class="min-h-0 flex-1">
            <BookshelfMenu :value="menuKey" />
          </XScrollArea>
        </XDrawer>
      </template>
    </XPageHeader>
    <BookshelfWeb
      v-if="type === 'web'"
      :favored-id="favoredId"
      :page="page"
      :query="query"
      :selected="selected"
    />
    <BookshelfWenku
      v-else-if="type === 'wenku'"
      :favored-id="favoredId"
      :page="page"
      :selected="selected"
    />
    <BookshelfLocal v-else :favored-id="favoredId" />
    <template v-if="isWideScreen" #aside>
      <section-header title="收藏夹">
        <BookshelfAddButton />
      </section-header>
      <bookshelf-menu :value="menuKey" class="min-h-0" />
    </template>
  </XPage>
</template>
