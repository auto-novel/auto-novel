<script lang="ts" setup>
import NovelListSkeleton from '@/components/NovelListSkeleton.vue';
import {
  XButton,
  XConfirmDialog,
  XEmpty,
  XError,
  XPagination,
  XSeparator,
  getApiErrorMessage,
  Toast,
  XPage,
  XPageHeader,
} from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  PauseCircleOutlineOutlined,
} from '@vicons/material';

import { WebNovelRepo } from '@/repos';
import router from '@/router';
import { useReadHistoryStore } from '@/stores';

const route = useRoute();

const onUpdatePage = (page: number) => {
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

const { page } = defineProps<{ page: number }>();

const readHistoryStore = useReadHistoryStore();
const { readHistoryPaused } = storeToRefs(readHistoryStore);

const loadingRecordState = ref(false);
const recordStateLoaded = ref(false);

const loadRecordState = async () => {
  if (loadingRecordState.value || recordStateLoaded.value) return;
  loadingRecordState.value = true;
  try {
    await readHistoryStore.loadReadHistoryPausedState();
    recordStateLoaded.value = true;
  } catch (reason) {
    Toast.error(getApiErrorMessage(reason, '读取历史记录状态失败，请重试'));
  } finally {
    loadingRecordState.value = false;
  }
};

onMounted(loadRecordState);

const recordStateLabel = computed(() => {
  if (loadingRecordState.value) return '加载中…';
  if (!recordStateLoaded.value) return '重试';
  return readHistoryPaused.value ? '恢复记录' : '暂停记录';
});

const toggleRecording = async () => {
  if (!recordStateLoaded.value) {
    await loadRecordState();
    return;
  }
  try {
    if (readHistoryPaused.value) {
      await readHistoryStore.resumeReadHistory();
    } else {
      await readHistoryStore.pauseReadHistory();
    }
  } catch (reason) {
    Toast.error(getApiErrorMessage(reason, '更新历史记录状态失败'));
  }
};

const { data: novelPage, error } = WebNovelRepo.useWebNovelHistoryList(
  () => page,
);

// 翻页加载期间保留总页数，避免上下分页被卸载。
const pageCount = computed<number>(
  (previous) => novelPage.value?.pageNumber ?? previous ?? 1,
);

const showClearConfirmation = ref(false);
const clearingHistory = ref(false);

const clearHistory = async () => {
  if (clearingHistory.value) return;
  clearingHistory.value = true;
  try {
    await Toast.promise(WebNovelRepo.clearReadHistory(), {
      success: '清空成功',
      error: (reason) => getApiErrorMessage(reason, '清空失败'),
    });
    showClearConfirmation.value = false;
    if (page !== 1) onUpdatePage(1);
  } catch {
    // 保留确认框，允许失败后重试。
  } finally {
    clearingHistory.value = false;
  }
};

const deleteHistory = async (providerId: string, novelId: string) => {
  // 删除当前页最后一条时回到上一页，避免停留在已超出总页数的空页。
  const isLastItemOfPage = page > 1 && novelPage.value?.items.length === 1;
  try {
    await Toast.promise(WebNovelRepo.deleteReadHistory(providerId, novelId), {
      success: '删除成功',
      error: (reason) => getApiErrorMessage(reason, '删除失败'),
    });
  } catch {
    return;
  }
  if (isLastItemOfPage) onUpdatePage(page - 1);
};
</script>

<template>
  <XPage role="region" aria-label="阅读历史列表">
    <XPageHeader title="阅读历史">
      <template #actions>
        <XButton
          color="neutral"
          variant="outline"
          size="sm"
          :loading="loadingRecordState"
          loading-auto
          @click="toggleRecording"
        >
          {{ recordStateLabel }}
        </XButton>
        <XButton
          color="danger"
          variant="outline"
          size="sm"
          :disabled="clearingHistory"
          @click="showClearConfirmation = true"
        >
          <DeleteOutlineOutlined class="size-4" aria-hidden="true" />
          清空记录
        </XButton>
      </template>
    </XPageHeader>

    <div
      v-if="readHistoryPaused"
      class="mt-3 flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3"
      role="status"
    >
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning-text"
      >
        <PauseCircleOutlineOutlined class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0 text-sm">
        <p class="m-0 font-medium text-ink">阅读历史已暂停</p>
        <p class="mt-0.5 mb-0 text-muted">
          暂停期间的阅读不会加入历史，已有记录不受影响。
        </p>
      </div>
    </div>

    <XConfirmDialog
      v-model:open="showClearConfirmation"
      title="清空阅读历史"
      description="确定清空全部阅读历史吗？此操作不可恢复，仅清空阅读历史，不影响收藏。"
      confirm-label="清空记录"
      danger
      :loading="clearingHistory"
      @confirm="clearHistory"
    />

    <XPagination
      v-if="pageCount > 1"
      class="mt-6"
      :ui="{ root: 'border-t-0 p-0 sm:px-0' }"
      :page="page"
      :total-pages="pageCount"
      @update:page="onUpdatePage"
    />

    <XSeparator :style="{ margin: pageCount > 1 ? '12px 0 0' : '24px 0 0' }" />

    <NovelListSkeleton v-if="!novelPage && !error" simple />
    <XError
      v-else-if="!novelPage && error"
      title="加载错误"
      :description="error.message"
    />
    <XEmpty
      v-else-if="novelPage && novelPage.items.length === 0"
      class="mt-3"
      title="暂无阅读历史"
      :description="
        readHistoryPaused
          ? '当前已暂停记录，恢复后阅读小说，会在这里留下记录。'
          : '阅读小说后，会在这里留下记录。'
      "
      size="compact"
    >
      <XButton color="neutral" variant="outline" @click="router.push('/novel')">
        浏览网络小说
      </XButton>
    </XEmpty>
    <template v-else-if="novelPage">
      <NovelListWeb :items="novelPage.items" simple>
        <template #action="item">
          <XButton
            color="neutral"
            variant="outline"
            size="tiny"
            class="mt-0.5 rounded-full"
            loading-auto
            @click="deleteHistory(item.providerId, item.novelId)"
          >
            删除
          </XButton>
        </template>
      </NovelListWeb>
    </template>

    <XPagination
      v-if="pageCount > 1"
      :page="page"
      :total-pages="pageCount"
      keyboard="window"
      @update:page="onUpdatePage"
    />
  </XPage>
</template>
