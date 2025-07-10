<script lang="ts" setup>
import { Result } from '@/util/result';
import { WebNovelOutlineDto } from '@/model/WebNovel';

defineProps<{ listResult?: Result<WebNovelOutlineDto[]> }>();
</script>

<template>
  <div v-if="!listResult" class="app-loading-box">
    <n-spin />
  </div>
  <c-result
    v-else
    :result="listResult"
    :show-empty="(it: WebNovelOutlineDto[]) => it.length === 0"
    v-slot="{ value: list }"
  >
    <n-grid :x-gap="12" :y-gap="12" cols="1 850:4">
      <n-grid-item
        v-for="item in list"
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
          有道 {{ item.youdao }} / GPT {{ item.gpt }} / Sakura {{ item.sakura }}
        </n-text>
      </n-grid-item>
    </n-grid>
  </c-result>
</template>
