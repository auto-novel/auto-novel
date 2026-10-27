<script lang="ts" setup>
import NovelGridSkeleton from '@/components/NovelGridSkeleton.vue';
import { XEmpty, XError } from '@novelia/web-kit';

import type { WenkuNovelOutlineDto } from '@/model/WenkuNovel';

defineProps<{
  novels: WenkuNovelOutlineDto[] | undefined;
  error: Error | null;
}>();
</script>

<template>
  <NovelGridSkeleton v-if="novels === undefined && !error" panel />
  <XError
    v-else-if="novels === undefined && error"
    title="加载错误"
    :description="error.message"
  />
  <XEmpty
    v-else-if="novels !== undefined && novels.length === 0"
    title="空列表"
    size="compact"
  />
  <template v-else-if="novels !== undefined">
    <div class="@container">
      <div class="grid grid-cols-3 gap-3 @min-[600px]:grid-cols-6">
        <router-link
          v-for="item in novels"
          :key="item.id"
          :to="`/wenku/${item.id}`"
          class="min-w-0"
        >
          <ImageCard :src="item.cover" :title="item.titleZh || item.title" />
        </router-link>
      </div>
    </div>
  </template>
</template>
