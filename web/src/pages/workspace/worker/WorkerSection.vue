<script lang="ts" setup>
import {
  Toast,
  XConfirmDialog,
  XDropdownMenu,
  XDropdownMenuItem,
  XEmpty,
} from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  MoreVertOutlined,
  PlayArrowOutlined,
  PlusOutlined,
  StopOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';
import { IndexedDbSegmentCache } from '@/domain/translator/IndexedDbSegmentCache';
import { useWorkspaceStore } from '@/stores';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';
import WorkspaceActionButton from '../WorkspaceActionButton.vue';
import GptWorkerDialog from './GptWorkerDialog.vue';
import SakuraWorkerDialog from './SakuraWorkerDialog.vue';
import WorkerCard from './WorkerCard.vue';

const props = defineProps<{
  translatorId: TranslatorId;
  workerStates: ReadonlyMap<
    string,
    { running: boolean; currentConcurrency: number }
  >;
  workerErrors: ReadonlyMap<string, number>;
  cacheName: ConstructorParameters<typeof IndexedDbSegmentCache>[0];
}>();

const emit = defineEmits<{
  start: [workerId: string];
  stop: [workerId: string];
  startAll: [];
  stopAll: [];
}>();

const showWorkerDialog = ref(false);
const isSakura = computed(() => props.translatorId === 'sakura');
const workerStore = useWorkspaceStore(
  isSakura.value ? 'sakura' : 'gpt-pipeline',
);
const workers = computed({
  get: () => workerStore.ref.value.workers,
  set: (workers) => {
    workerStore.ref.value.workers = workers;
  },
});
const showClearCacheDialog = ref(false);
const clearingCache = ref(false);

const clearCache = async () => {
  if (clearingCache.value) return;
  clearingCache.value = true;
  try {
    const success = await Toast.promise(
      new IndexedDbSegmentCache(props.cacheName).clear().then(() => true),
      {
        success: '缓存清除成功',
        error: '缓存清除失败',
      },
    );
    if (success) showClearCacheDialog.value = false;
  } finally {
    clearingCache.value = false;
  }
};
const hasStartedWorkers = computed(() =>
  workers.value.some((w) => props.workerStates.get(w.id)?.running),
);
const hasStoppedWorkers = computed(() =>
  workers.value.some((w) => !props.workerStates.get(w.id)?.running),
);
</script>

<template>
  <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
    <h2 class="m-0 flex items-center gap-2 text-base font-medium">
      <span
        class="w-1 self-stretch rounded-full bg-primary"
        aria-hidden="true"
      />
      翻译器
    </h2>
    <div class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <WorkspaceActionButton
        v-if="workers.length"
        label="全部启动"
        :icon="PlayArrowOutlined"
        :disabled="!hasStoppedWorkers"
        @action="emit('startAll')"
      />
      <WorkspaceActionButton
        v-if="workers.length"
        label="全部停止"
        :icon="StopOutlined"
        :disabled="!hasStartedWorkers"
        @action="emit('stopAll')"
      />
      <WorkspaceActionButton
        label="添加"
        :icon="PlusOutlined"
        @action="showWorkerDialog = true"
      />
      <XDropdownMenu v-if="workers.length" align="end">
        <template #trigger>
          <WorkspaceActionButton
            label="更多翻译器操作"
            :icon="MoreVertOutlined"
            icon-only
            title="更多翻译器操作"
          />
        </template>
        <XDropdownMenuItem
          :disabled="clearingCache"
          @select="showClearCacheDialog = true"
        >
          <DeleteOutlineOutlined class="size-4" aria-hidden="true" />
          清空翻译缓存
        </XDropdownMenuItem>
      </XDropdownMenu>
    </div>
  </div>

  <XEmpty v-if="workers.length === 0" title="没有翻译器" size="compact" />
  <VueDraggable
    v-else
    v-model="workers"
    tag="ul"
    class="m-0 list-none divide-y divide-divider p-0"
    aria-label="翻译器列表"
    :animation="150"
    handle=".drag-trigger"
    filter=".is-running"
  >
    <li
      v-for="w of workers"
      :key="w.id"
      class="py-3"
      :class="{ 'is-running': workerStates.get(w.id)?.running }"
    >
      <WorkerCard
        :translator-id="translatorId"
        :worker="w"
        :running="!!workerStates.get(w.id)?.running"
        :current-concurrency="workerStates.get(w.id)?.currentConcurrency ?? 0"
        :error-count="workerErrors.get(w.id) ?? 0"
        @start="emit('start', $event)"
        @stop="emit('stop', $event)"
        @delete="workerStore.deleteWorker"
      />
    </li>
  </VueDraggable>

  <XConfirmDialog
    v-model:open="showClearCacheDialog"
    title="清空缓存"
    description="真的要清空缓存吗？"
    confirm-label="清空缓存"
    :loading="clearingCache"
    danger
    @confirm="clearCache"
  />
  <SakuraWorkerDialog v-if="isSakura" v-model:show="showWorkerDialog" />
  <GptWorkerDialog v-else v-model:show="showWorkerDialog" />
</template>
