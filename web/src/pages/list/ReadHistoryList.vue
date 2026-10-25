<script lang="ts" setup>
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import {
  Toast,
  XAsyncContent,
  XPagination,
  XSeparator,
} from '@novelia/web-kit';
import { DeleteOutlineOutlined } from '@vicons/material';

import { ReadHistoryApi } from '@/api';
import { WebNovelRepo } from '@/repos';
import router from '@/router';
import { useReadHistoryStore } from '@/stores';

const route = useRoute();

const onUpdatePage = (page: number) => {
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

const props = defineProps<{
  page: number;
}>();

const readHistoryStore = useReadHistoryStore();
const { readHistoryPaused } = storeToRefs(readHistoryStore);

onMounted(() => {
  readHistoryStore.loadReadHistoryPausedState();
});

const { data: novelPage, error } = WebNovelRepo.useWebNovelHistoryList(
  () => props.page,
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);

const clearHistory = () =>
  Toast.promise(
    ReadHistoryApi.clearReadHistoryWeb().then(() => {
      window.location.reload();
    }),
    { success: '清空成功', error: '清空失败' },
  );

const deleteHistory = (providerId: string, novelId: string) =>
  Toast.promise(
    ReadHistoryApi.deleteReadHistoryWeb(providerId, novelId).then(() => {
      window.location.reload();
    }),
    { success: '删除成功', error: '删除失败' },
  );
</script>

<template>
  <div role="region" aria-label="阅读历史列表" class="layout-content">
    <n-h1>阅读历史</n-h1>

    <n-flex>
      <c-button-confirm
        hint="真的要清空记录吗？"
        label="清空记录"
        :icon="DeleteOutlineOutlined"
        @action="clearHistory()"
      />
      <c-button
        v-if="readHistoryPaused"
        label="继续记录历史"
        @action="readHistoryStore.resumeReadHistory()"
      />
      <c-button
        v-else
        label="暂停记录历史"
        @action="readHistoryStore.pauseReadHistory()"
      />
    </n-flex>

    <n-text v-if="readHistoryPaused" type="warning" class="mt-4 block">
      注意：历史功能已暂停
    </n-text>

    <XPagination
      v-if="pageCount > 1"
      class="mt-6"
      :ui="{ root: 'border-t-0 p-0 sm:px-0' }"
      :page="page"
      :total-pages="pageCount"
      @update:page="onUpdatePage"
    />

    <XSeparator :style="{ margin: pageCount > 1 ? '12px 0 0' : '24px 0 0' }" />

    <template v-if="novelPage">
      <NovelListWeb :items="novelPage.items" :option="[]" simple>
        <template #action="item">
          <c-button
            size="tiny"
            label="删除"
            style="margin-top: 2px"
            @action="deleteHistory(item.providerId, item.novelId)"
          />
        </template>
      </NovelListWeb>
      <n-empty
        v-if="novelPage.items.length === 0"
        class="mt-3"
        description="空列表"
      />
    </template>

    <XAsyncContent
      v-else
      :loading="!error"
      :error="error?.message ?? ''"
      error-title="加载错误"
    >
      <template #loading>
        <NovelListSkeleton simple />
      </template>
    </XAsyncContent>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </div>
</template>
