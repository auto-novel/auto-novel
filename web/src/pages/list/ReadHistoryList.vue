<script lang="ts" setup>
import { useListAutofocus } from '@/pages/list/useListAutofocus';
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import { Toast, XAsyncContent, XPagination } from '@novelia/web-kit';
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

const paginationScope = useTemplateRef<HTMLElement>('paginationScope');
useListAutofocus(paginationScope);

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

const pageCount = computed(() => novelPage.value?.pageNumber ?? 1);

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
  <div
    ref="paginationScope"
    tabindex="0"
    role="region"
    aria-label="阅读历史列表"
    class="layout-content"
  >
    <n-h1>阅读历史</n-h1>

    <n-flex style="margin-bottom: 24px">
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

    <n-text v-if="readHistoryPaused" type="warning">
      注意：历史功能已暂停
    </n-text>

    <template v-if="novelPage">
      <n-divider />
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
      <n-empty v-if="novelPage.items.length === 0" description="空列表" />
    </template>

    <XAsyncContent
      v-else
      :loading="!error"
      :error="error?.message ?? ''"
      error-title="加载错误"
    >
      <template #loading>
        <n-divider />
        <NovelListSkeleton simple />
      </template>
    </XAsyncContent>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard
      :keyboard-scope="paginationScope"
      @update:page="onUpdatePage"
    />
  </div>
</template>
