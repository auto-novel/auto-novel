<script lang="ts" setup>
import type { WebNovelOutlineDto } from '@/model/WebNovel';

defineProps<{
  novels: WebNovelOutlineDto[] | undefined;
  error: Error | null;
}>();
</script>

<template>
  <template v-if="novels !== undefined">
    <n-grid :x-gap="12" :y-gap="12" cols="1 850:4">
      <n-grid-item
        v-for="item in novels"
        :key="`${item.providerId}/${item.novelId}`"
        style="padding: 8px"
      >
        <c-a :to="`/novel/${item.providerId}/${item.novelId}`">
          <span class="text-2line">
            {{ item.titleJp }}
          </span>
        </c-a>
        <div class="text-2line">{{ item.titleZh }}</div>
        <n-text depth="3">
          {{ item.type }} / 总计 {{ item.total }} / 百度 {{ item.baidu }}
          <br />
          有道 {{ item.youdao }} / GPT {{ item.gpt }} / Sakura
          {{ item.sakura }} / Murasaki {{ item.murasaki }}
        </n-text>
      </n-grid-item>
    </n-grid>
    <n-empty v-if="novels.length === 0" description="空列表" />
  </template>

  <CResultX v-else :error="error" title="加载错误" />
</template>
