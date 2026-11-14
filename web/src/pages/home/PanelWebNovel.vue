<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';

import type { WebNovelOutlineDto } from '@/model/WebNovel';

defineProps<{
  novels: WebNovelOutlineDto[] | undefined;
  error: Error | null;
}>();
</script>

<template>
  <NovelListSkeleton v-if="novels === undefined && !error" panel />
  <UAlert
    color="error"
    variant="soft"
    v-else-if="novels === undefined && error"
    title="加载错误"
    :description="error.message"
  />
  <CEmpty
    v-else-if="novels !== undefined && novels.length === 0"
    title="空列表"
  />
  <template v-else-if="novels !== undefined">
    <div class="@container">
      <div class="grid grid-cols-1 gap-3 @min-[850px]:grid-cols-4">
        <div
          v-for="item in novels"
          :key="`${item.providerId}/${item.novelId}`"
          class="min-w-0 p-2"
        >
          <ULink :to="`/novel/${item.providerId}/${item.novelId}`">
            <span class="line-clamp-2">
              {{ item.titleJp }}
            </span>
          </ULink>
          <div class="line-clamp-2">{{ item.titleZh }}</div>
          <span class="text-muted">
            {{ item.type }} / 总计 {{ item.total }} / 有道 {{ item.youdao }}
            <br />
            GPT {{ item.gpt }} / Sakura {{ item.sakura }}
          </span>
        </div>
      </div>
    </div>
  </template>
</template>
