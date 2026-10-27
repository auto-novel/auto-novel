<script lang="ts" setup>
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';
import LocalVolumeTranslationDrawer from '../toolbox/local-volume/LocalVolumeTranslationDrawer.vue';
import TaskSection from './task/TaskSection.vue';
import { useWorkspaceRuntime } from './useWorkspaceRuntime';
import WorkspaceBulletin from './WorkspaceBulletin.vue';
import WorkerSection from './worker/WorkerSection.vue';

const props = defineProps<{ translatorId: TranslatorId }>();
const isSakura = computed(() => props.translatorId === 'sakura');
const showLocalVolumeDrawer = ref(false);
const {
  jobs,
  segCacheName,
  taskStates,
  taskCache,
  workerStates,
  workerErrors,
  startWorker,
  stopWorker,
  startAllWorkers,
  stopAllWorkers,
  deleteJob,
  topJob,
  bottomJob,
  runProcessLoop,
} = useWorkspaceRuntime(props.translatorId);
</script>

<template>
  <div class="layout-content">
    <h1 class="my-6 text-[30px]/[1.6] font-medium text-ink">
      {{ isSakura ? 'Sakura' : 'GPT' }}工作区
    </h1>
    <WorkspaceBulletin :translator-id="translatorId" />

    <WorkerSection
      :translator-id="translatorId"
      :worker-states="workerStates"
      :worker-errors="workerErrors"
      :cache-name="segCacheName"
      @start="startWorker"
      @stop="stopWorker"
      @start-all="startAllWorkers"
      @stop-all="stopAllWorkers"
    />

    <TaskSection
      :translator-id="translatorId"
      :jobs="jobs"
      :task-states="taskStates"
      :task-cache="taskCache"
      @delete="deleteJob"
      @retry="runProcessLoop"
      @top="topJob"
      @bottom="bottomJob"
      @open-local-volume="showLocalVolumeDrawer = true"
    />
  </div>

  <LocalVolumeTranslationDrawer
    v-model:show="showLocalVolumeDrawer"
    :type="translatorId"
  />
</template>
