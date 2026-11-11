<script lang="ts" setup>
import CEmpty from '@/components/CEmpty.vue';
import { XConfirmDialog, getApiErrorMessage, Toast } from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  MoreVertOutlined,
  PlayArrowOutlined,
  PlusOutlined,
  StopOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';
import { useWorkspaceStore } from '@/stores';
import type { WorkspaceTranslatorId } from '@/model/Translator';
import WorkspaceActionButton from '../WorkspaceActionButton.vue';
import GptWorkerDialog from './GptWorkerDialog.vue';
import SakuraWorkerDialog from './SakuraWorkerDialog.vue';
import WorkerCard from './WorkerCard.vue';

const props = defineProps<{
  translatorId: WorkspaceTranslatorId;
  workerStates: ReadonlyMap<
    string,
    { running: boolean; currentConcurrency: number }
  >;
  workerErrors: ReadonlyMap<string, number>;
  clearTranslationCache: () => Promise<void>;
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
  await Toast.promise(props.clearTranslationCache(), {
    success: '缓存清除成功',
    error: (reason) => getApiErrorMessage(reason, '缓存清除失败'),
  })
    .then(() => {
      showClearCacheDialog.value = false;
    })
    .catch(() => {});
  clearingCache.value = false;
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
      <UDropdownMenu
        v-if="workers.length"
        :content="{ align: 'end' }"
        :items="[
          {
            label: '清空翻译缓存',
            disabled: clearingCache,
            onSelect: () => {
              showClearCacheDialog = true;
            },
          },
        ]"
      >
        <WorkspaceActionButton
          label="更多翻译器操作"
          :icon="MoreVertOutlined"
          icon-only
          title="更多翻译器操作"
        />
      </UDropdownMenu>
    </div>
  </div>

  <CEmpty v-if="workers.length === 0" title="没有翻译器" />
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
