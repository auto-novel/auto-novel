<script lang="ts" setup>
import { WenkuNovelOutlineDto } from '@/model/WenkuNovel';
import { Result } from '@/util/result';

defineProps<{ listResult?: Result<WenkuNovelOutlineDto[]> }>();
</script>

<template>
  <div v-if="!listResult" class="app-loading-box">
    <n-spin />
  </div>
  <c-result
    v-else
    :result="listResult"
    :show-empty="(it: WenkuNovelOutlineDto[]) => it.length === 0"
    v-slot="{ value: list }"
  >
    <n-grid :x-gap="12" :y-gap="12" cols="3 600:6">
      <n-grid-item v-for="item in list" :key="item.id">
        <router-link :to="`/wenku/${item.id}`">
          <ImageCard
            :src="item.cover"
            :title="item.titleZh ? item.titleZh : item.title"
          />
        </router-link>
      </n-grid-item>
    </n-grid>
  </c-result>
</template>
