<script lang="ts" setup>
import { XPage } from '@novelia/web-kit';
import { BookOutlined } from '@vicons/material';
import type { WorkspaceTranslatorId } from '@/model/Translator';
import WorkspaceLog from './WorkspaceLog.vue';
import LocalVolumeTranslationDrawer from '../toolbox/local-volume/LocalVolumeTranslationDrawer.vue';
import TaskSection from './task/TaskSection.vue';
import { useWorkspaceRuntime } from './useWorkspaceRuntime';
import WorkspaceBulletin from './WorkspaceBulletin.vue';
import WorkerSection from './worker/WorkerSection.vue';

const props = defineProps<{ translatorId: WorkspaceTranslatorId }>();
const isSakura = computed(() => props.translatorId === 'sakura');
const showLocalVolumeDrawer = ref(false);
const {
  logs,
  clearLogs,
  jobs,
  clearTranslationCache,
  taskStates,
  taskErrors,
  workerStates,
  workerErrors,
  startWorker,
  stopWorker,
  startAllWorkers,
  stopAllWorkers,
  deleteJob,
  retryTask,
  topJob,
  bottomJob,
} = useWorkspaceRuntime(props.translatorId);
</script>

<template>
  <XPage>
    <UPageHeader :title="isSakura ? 'Sakura工作区' : 'GPT工作区'">
      <template #links>
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          @click="showLocalVolumeDrawer = true"
        >
          <BookOutlined class="size-4" aria-hidden="true" />
          本地书架
        </UButton>
      </template>
    </UPageHeader>
    <WorkspaceBulletin :translator-id="translatorId" />

    <WorkerSection
      :translator-id="translatorId"
      :worker-states="workerStates"
      :worker-errors="workerErrors"
      :clear-translation-cache="clearTranslationCache"
      @start="startWorker"
      @stop="stopWorker"
      @start-all="startAllWorkers"
      @stop-all="stopAllWorkers"
    />

    <WorkspaceLog
      v-if="workerStates.size > 0"
      :logs="logs"
      @clear="clearLogs"
    />

    <TaskSection
      :jobs="jobs"
      :task-states="taskStates"
      :task-errors="taskErrors"
      @delete="deleteJob"
      @retry="retryTask"
      @top="topJob"
      @bottom="bottomJob"
    />
  </XPage>

  <LocalVolumeTranslationDrawer
    v-model:show="showLocalVolumeDrawer"
    :type="translatorId"
  />
</template>
