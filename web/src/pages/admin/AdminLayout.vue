<script lang="ts" setup>
import { useRoute, useRouter } from 'vue-router';

import { useWhoamiStore } from '@/stores';

const router = useRouter();
const route = useRoute();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const path = computed(() => route.path);
const handleUpdateValue = (path: string) => router.push({ path });
</script>

<template>
  <div class="layout-content">
    <template v-if="whoami.isSignedIn">
      <n-h1>控制台</n-h1>
      <n-tabs
        type="line"
        :value="path"
        @update:value="handleUpdateValue"
        style="margin-bottom: 24px"
      >
        <n-tab name="/admin/operation">操作历史</n-tab>
        <n-tab name="/admin/web-toc-merge-history">合并历史</n-tab>
      </n-tabs>
      <router-view />
    </template>
    <n-result v-else status="error" title="未登录" />
  </div>
</template>
