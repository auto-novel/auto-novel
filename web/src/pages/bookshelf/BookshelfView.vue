<script lang="ts" setup>
import { XPage, XPageHeader } from '@novelia/web-kit';

import { useIsWideScreen } from '@/pages/util';
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

const isWideScreen = useIsWideScreen();
</script>

<template>
  <XPage>
    <XPageHeader title="我的收藏" />
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
        <bookshelf-add-button />
      </section-header>
      <bookshelf-menu :value="menuKey" class="min-h-0" />
    </template>
  </XPage>
</template>
