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
  retry: [];
  top: [task: string];
  bottom: [task: string];
}>();

const movedTask = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

function moveTask(task: string, direction: 'top' | 'bottom') {
  const index = props.jobs.findIndex((job) => job.task === task);
  if (
    index < 0 ||
    (direction === 'top' ? index === 0 : index === props.jobs.length - 1)
  ) {
    return;
  }

  if (direction === 'top') emit('top', task);
  else emit('bottom', task);

  movedTask.value = task;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    movedTask.value = null;
  }, 1200);
}

onBeforeUnmount(() => clearTimeout(highlightTimer));

const deleteMode = ref<'completed' | 'all' | null>(null);
const completedJobs = computed(() => props.jobs.filter((job) => job.finishAt));
const deleteTargets = computed(() =>
  deleteMode.value === 'completed' ? completedJobs.value : props.jobs,
);

function deleteJobs() {
  for (const job of deleteTargets.value) emit('delete', job.task);
  deleteMode.value = null;
}

const hasFailedTasks = computed(() =>
  props.jobs.some((job) => props.taskStates.get(job.task)?.hasFailedChapters()),
);
function retryFailedTasks() {
  let hasFailed = false;
  for (const job of props.jobs) {
    if (!props.taskStates.get(job.task)?.resetFailedChapters()) continue;
    delete job.finishAt;
    hasFailed = true;
  }
  if (hasFailed) emit('retry');
  else Toast.info('没有需要重试的失败任务');
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
        v-if="hasFailedTasks"
        label="重试失败"
        :icon="RefreshOutlined"
        @action="retryFailedTasks"
      />
      <WorkspaceActionButton
        v-if="jobs.length"
        label="清理已完成"
        :icon="DeleteOutlineOutlined"
        :disabled="!completedJobs.length"
        @action="deleteMode = 'completed'"
      />
      <XDropdownMenu v-if="jobs.length" align="end">
        <template #trigger>
          <WorkspaceActionButton
            label="更多任务操作"
            :icon="MoreVertOutlined"
            icon-only
            title="更多任务操作"
          />
        </template>
        <XDropdownMenuItem @select="deleteMode = 'all'">
          <DeleteOutlineOutlined class="size-4" aria-hidden="true" />
          清空队列
        </XDropdownMenuItem>
      </XDropdownMenu>
    </div>
  </div>

  <XEmpty v-if="jobs.length === 0" title="没有任务" size="compact" />
  <TransitionGroup v-else name="task-reorder" tag="div" class="flex flex-col">
    <div
      v-for="(job, index) of jobs"
      :key="job.task"
      class="task-item [&+.task-item]:border-t! [&+.task-item]:border-divider!"
      :class="{ 'task-moved': movedTask === job.task }"
    >
      <TaskCard
        :job="job"
        :translator-id="translatorId"
        :task-state="taskStates.get(job.task)"
        :task-cache-entry="taskCache.get(job.task)"
        :can-move-top="index > 0"
        :can-move-bottom="index < jobs.length - 1"
        @delete="emit('delete', $event)"
        @retry="emit('retry')"
        @top="moveTask($event, 'top')"
        @bottom="moveTask($event, 'bottom')"
      />
    </div>
  </TransitionGroup>

  <XConfirmDialog
    :open="deleteMode !== null"
    :title="deleteMode === 'completed' ? '清理已完成任务' : '清空队列'"
    :description="
      deleteMode === 'completed'
        ? `确定删除 ${deleteTargets.length} 个已完成任务吗？`
        : `确定清空队列中的 ${deleteTargets.length} 个任务吗？正在执行章节翻译的任务将保留。`
    "
    :confirm-label="deleteMode === 'completed' ? '清理' : '清空'"
    danger
    @update:open="!$event && (deleteMode = null)"
    @confirm="deleteJobs"
  />
</template>

<style scoped>
.task-moved {
  animation: task-move-flash 600ms ease-in-out 2;
}

@keyframes task-move-flash {
  0%,
  100% {
    background-color: transparent;
  }
  50% {
    background-color: color-mix(
      in oklab,
      var(--color-primary) 10%,
      transparent
    );
  }
}

.task-reorder-move {
  transition: transform 250ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .task-item {
    transition: none;
  }

  .task-moved {
    animation: none;
    background-color: color-mix(
      in oklab,
      var(--color-primary) 10%,
      transparent
    );
  }
}
</style>
