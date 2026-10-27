<script lang="ts" setup>
import { Toast, XConfirmDialog, XEmpty, XSeparator } from '@novelia/web-kit';
import {
  BookOutlined,
  DeleteOutlineOutlined,
  RefreshOutlined,
} from '@vicons/material';
import type { TaskState } from '@/domain/translator/TaskState';
import type {
  TranslationTask,
  TranslatorId,
} from '@/domain/translator/TranslationTask/types';
import type { TranslateJob } from '@/model/Translator';
import WorkspaceActionButton from '../WorkspaceActionButton.vue';
import TaskCard from './TaskCard.vue';

const props = defineProps<{
  translatorId: TranslatorId;
  jobs: TranslateJob[];
  taskStates: ReadonlyMap<string, TaskState>;
  taskCache: ReadonlyMap<string, TranslationTask>;
}>();

const emit = defineEmits<{
  delete: [task: string];
  retry: [task: string];
  top: [task: string];
  bottom: [task: string];
  openLocalVolume: [];
}>();

const showDeleteJobsDialog = ref(false);
type TaskFilter = 'all' | 'done' | 'pending';
const taskFilter = ref<TaskFilter>('all');
const filterOptions: { label: string; value: TaskFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '已完成', value: 'done' },
  { label: '未完成', value: 'pending' },
];
const filteredJobs = computed(() => {
  if (taskFilter.value === 'all') return props.jobs;
  return props.jobs.filter(
    (job) => (job.finishAt ? 'done' : 'pending') === taskFilter.value,
  );
});

const deleteAllJobs = () => {
  filteredJobs.value.forEach((job) => emit('delete', job.task));
  showDeleteJobsDialog.value = false;
};

const taskCardRefs = ref<InstanceType<typeof TaskCard>[]>([]);
const hasFailedTasks = computed(() =>
  taskCardRefs.value.some((card) => card?.hasFailedChapters()),
);
function retryTaskCards() {
  let hasFailed = false;
  for (const card of taskCardRefs.value) {
    if (card?.hasFailedChapters?.()) {
      card.retryAllFailed();
      hasFailed = true;
    }
  }
  if (!hasFailed) Toast.info('没有需要重试的失败任务');
}
</script>

<template>
  <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
    <h2 class="m-0 flex items-center gap-2 text-base font-medium">
      <span
        class="w-1 self-stretch rounded-full bg-primary"
        aria-hidden="true"
      />
      任务队列
    </h2>
    <div class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <WorkspaceActionButton
        v-if="filteredJobs.length"
        label="删除筛选"
        :icon="DeleteOutlineOutlined"
        @action="showDeleteJobsDialog = true"
      />
      <WorkspaceActionButton
        v-if="hasFailedTasks"
        label="重试失败"
        :icon="RefreshOutlined"
        @action="retryTaskCards"
      />
      <WorkspaceActionButton
        label="本地书架"
        :icon="BookOutlined"
        @action="emit('openLocalVolume')"
      />
    </div>
  </div>

  <NFlex vertical>
    <CActionWrapper title="状态">
      <CRadioGroup
        v-model:value="taskFilter"
        :options="filterOptions"
        size="small"
      />
    </CActionWrapper>
  </NFlex>
  <XSeparator class="mt-4 mb-2" />
  <XEmpty v-if="filteredJobs.length === 0" title="没有任务" size="compact" />
  <div v-else class="task-list">
    <TaskCard
      v-for="job of filteredJobs"
      ref="taskCardRefs"
      :key="job.task"
      :job="job"
      :translator-id="translatorId"
      :task-state="taskStates.get(job.task)"
      :task-cache-entry="taskCache.get(job.task)"
      @delete="emit('delete', $event)"
      @retry="emit('retry', $event)"
      @top="emit('top', $event)"
      @bottom="emit('bottom', $event)"
    />
  </div>

  <XConfirmDialog
    v-model:open="showDeleteJobsDialog"
    title="删除筛选任务"
    description="真的要删除筛选出的任务吗？"
    confirm-label="删除"
    danger
    @confirm="deleteAllJobs"
  />
</template>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
}
</style>
