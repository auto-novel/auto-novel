<script lang="ts" setup>
import {
  BookOutlined,
  DeleteOutlineOutlined,
  PlusOutlined,
  RefreshOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';
import {
  Semaphore,
  OpenAiTranslator,
  TranslationPipeline,
} from '@auto-novel/translator';
import type { TranslatorTracker } from '@auto-novel/translator';

import { doAction } from '@/pages/util';
import { useGptPipelineWorkspaceStore, useWorkspaceStore } from '@/stores';
import { TaskExecutor } from '@/domain/translator/TaskExecutor';
import { IndexedDbSegmentCache } from '@/domain/translator/IndexedDbSegmentCache';
import { createTranslationTask } from '@/domain/translator/TranslationTask/createTranslationTask';
import type { TranslationTask } from '@/domain/translator/TranslationTask/types';
import { TaskState } from '@/domain/translator/TaskState';
import type { ChapterStatus } from '@/domain/translator/TaskState';
import type { TranslateJob, TranslateJobRecord } from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';
import PipelineTaskCard from './components/PipelineTaskCard.vue';

const message = useMessage();
const pipelineWorkspace = useGptPipelineWorkspaceStore();
const gptWorkspace = useWorkspaceStore('gpt'); // 暂时与旧版 GPT 共享任务队列
const jobs = computed(() => gptWorkspace.ref.value.jobs);

const showWorkerModal = ref(false);
const showLocalVolumeDrawer = ref(false);

/** 同时处理的章节数上限 */
const GLOBAL_WINDOW = 66;
/** 同时 fetch 的章节数上限 */
const FETCH_CONCURRENCY = 1;
const fetchSemaphore = new Semaphore(FETCH_CONCURRENCY);
/** pipeline 内同时翻译的分块的高水位标记 */
const HIGH_WATER_MARK = 100;
const pipeline = new TranslationPipeline(
  HIGH_WATER_MARK,
  undefined,
  new IndexedDbSegmentCache('gpt-seg-cache'),
);

// ========== 任务状态管理 ==========

const taskStates = ref(new Map<string, TaskState>());
const taskCache = new Map<string, TranslationTask>();
const taskVersions = ref(new Map<string, number>());

interface WorkerState {
  running: boolean;
  concurrency: { current: number; max: number };
}
const workerStates = ref(new Map<string, WorkerState>());
const workerErrors = computed(() => {
  const errors = new Map<string, number>();
  for (const [, state] of taskStates.value) {
    for (const [, chapterState] of state.chapterStates) {
      for (const seg of chapterState.segments) {
        if (seg.status === 'error' && seg.translatorId) {
          errors.set(seg.translatorId, (errors.get(seg.translatorId) ?? 0) + 1);
        }
      }
    }
  }
  return errors;
});
const executingTasks = reactive(new Set<string>());

let processLoopAbortController: AbortController | null = null;
let processLoopPromise: Promise<void> | null = null;

onUnmounted(() => {
  pipeline.clearLoops();
  processLoopAbortController?.abort();
  processLoopAbortController = null;
  processLoopPromise = null;
  executingTasks.clear();
});
// ========== 任务过滤 ==========

type TaskFilter = 'all' | 'done' | 'pending';
const taskFilter = ref<TaskFilter>('all');

const filterOptions: { label: string; value: TaskFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '已完成', value: 'done' },
  { label: '未完成', value: 'pending' },
];

function getTaskStatus(taskDesc: string): TaskFilter {
  const job = jobs.value.find((j) => j.task === taskDesc);
  return job?.finishAt ? 'done' : 'pending';
}

const filteredJobs = computed(() => {
  if (taskFilter.value === 'all') return jobs.value;
  return jobs.value.filter((j) => getTaskStatus(j.task) === taskFilter.value);
});

async function getOrCreateTask(taskDesc: string): Promise<TranslationTask> {
  let task = taskCache.get(taskDesc);
  if (!task) {
    const { desc, params } = TranslateTaskDescriptor.parse(taskDesc);
    task = createTranslationTask(desc, 'gpt', params);
    taskCache.set(taskDesc, task);
  }
  return task;
}

function getNextJob(
  jobs: TranslateJob[],
  taskStatesMap: Map<string, TaskState>,
): { job: TranslateJob; chapterId: string; state: TaskState } | null {
  for (const job of jobs) {
    if (job.finishAt) continue;
    const state = taskStatesMap.get(job.task);
    if (!state) continue;
    for (const ch of state.chapters) {
      if (ch.status !== 'pending') continue;
      ch.status = 'translating';
      return { job, chapterId: ch.chapterId, state };
    }
  }
  return null;
}

function countPendingChapters(
  jobs: TranslateJob[],
  taskStatesMap: Map<string, TaskState>,
): number {
  let count = 0;
  for (const job of jobs) {
    if (job.finishAt) continue;
    const state = taskStatesMap.get(job.task);
    if (!state) continue;
    for (const ch of state.chapters) {
      if (ch.status === 'pending') count++;
    }
  }
  return count;
}

function hasRunningWorker(): boolean {
  return [...workerStates.value.values()].some((s) => s.running);
}

function clearTaskRuntimeState(task: string): void {
  taskStates.value.delete(task);
  taskCache.delete(task);
  taskVersions.value.delete(task);
}

// ========== 全局处理循环 ==========

function runProcessLoop(): Promise<void> | null {
  if (processLoopPromise) return processLoopPromise;
  if (!hasRunningWorker()) {
    return null;
  }

  processLoopAbortController = new AbortController();
  const signal = processLoopAbortController.signal;

  const processOne = async () => {
    while (!signal.aborted) {
      const item = getNextJob(jobs.value, taskStates.value);
      if (!item) break;

      const { job, chapterId, state } = item;
      executingTasks.add(job.task);

      const task = await getOrCreateTask(job.task);
      const executor = new TaskExecutor(task, pipeline, fetchSemaphore);

      const segmentTracker = state.getChapterState(chapterId);
      if (!segmentTracker) continue;
      await executor
        .executeChapter(
          chapterId,
          {
            onChapterStatus: (cid: string, st: ChapterStatus) => {
              state.updateStatus(cid, st);
            },
            onProgress: (finished: number, error: number, total: number) => {
              (job as TranslateJobRecord).progress = { finished, error, total };
            },
            onLog: (msg: string) => console.log(`[${job.task}] ${msg}`),
            segmentTracker,
          },
          signal,
        )
        .then(() => {
          const allDone = state.chapters.every((c) => c.status === 'done');
          if (allDone) {
            executingTasks.delete(job.task);
            (job as TranslateJobRecord).finishAt = Date.now();
          }
        });
    }
  };

  const pendingCount = countPendingChapters(jobs.value, taskStates.value);
  const windowSize = Math.min(GLOBAL_WINDOW, pendingCount || 1);
  const workers = Array.from({ length: windowSize }, () => processOne());

  processLoopPromise = Promise.all(workers).then(() => {
    for (const t of [...executingTasks]) {
      executingTasks.delete(t);
    }
    processLoopPromise = null;
    processLoopAbortController = null;
    if (countPendingChapters(jobs.value, taskStates.value) > 0) {
      runProcessLoop();
    }
  });

  return processLoopPromise;
}

// ========== Worker 生命周期管理 ==========

const startWorker = (workerId: string) => {
  if (workerStates.value.get(workerId)?.running) return;

  const w = pipelineWorkspace.ref.value.workers.find((w) => w.id === workerId);
  if (!w) {
    message.error(`翻译器 ${workerId} 不存在`);
    return;
  }

  workerStates.value.set(workerId, {
    running: true,
    concurrency: { current: 0, max: w.concurrency },
  });

  const t = new OpenAiTranslator({
    endpoint: w.endpoint,
    key: w.key,
    model: w.model,
  });

  const workerTracker: TranslatorTracker = {
    onConcurrencyChange: (current: number, max: number) => {
      const state = workerStates.value.get(w.id);
      if (state) state.concurrency = { current, max };
    },
  };
  pipeline.registerTranslator(t, w.concurrency, workerTracker, w.id);

  runProcessLoop();
};

const stopWorker = (workerId: string) => {
  const state = workerStates.value.get(workerId);
  if (!state?.running) return;

  pipeline.unregisterTranslator(workerId);

  workerStates.value.set(workerId, { ...state, running: false });

  if ([...workerStates.value.values()].every((s) => !s.running)) {
    processLoopAbortController?.abort();
    processLoopAbortController = null;
    processLoopPromise = null;
  }
};

const startAllWorkers = () => {
  for (const w of pipelineWorkspace.ref.value.workers) startWorker(w.id);
};

const stopAllWorkers = () => {
  for (const w of pipelineWorkspace.ref.value.workers) stopWorker(w.id);
};

const deleteJob = (task: string) => {
  if (executingTasks.has(task)) {
    message.error('任务正在翻译中');
    return;
  }
  gptWorkspace.deleteJob(task);
  clearTaskRuntimeState(task);
};

const deleteAllJobs = () =>
  filteredJobs.value.forEach((j) => deleteJob(j.task));

const taskCardRefs = ref<InstanceType<typeof PipelineTaskCard>[]>([]);
function retryTaskCards() {
  let hasFailed = false;
  for (const card of taskCardRefs.value) {
    if (card?.hasFailedChapters?.()) {
      card.retryAllFailed();
      hasFailed = true;
    }
  }
  if (!hasFailed) {
    message.info('没有需要重试的失败任务');
  }
}

const clearCache = () =>
  doAction(
    new IndexedDbSegmentCache('gpt-seg-cache').clear(),
    '缓存清除',
    message,
  );

watch(
  () => [...jobs.value],
  async (workspaceJobs) => {
    const uninitialized: TranslateJob[] = [];
    const activeTasks = new Set(workspaceJobs.map((job) => job.task));
    const knownTasks = new Set([
      ...taskStates.value.keys(),
      ...taskCache.keys(),
      ...taskVersions.value.keys(),
    ]);
    for (const task of knownTasks) {
      if (!activeTasks.has(task)) clearTaskRuntimeState(task);
    }

    for (const job of workspaceJobs) {
      if (taskVersions.value.get(job.task) !== job.createAt) {
        clearTaskRuntimeState(job.task);
      }
      const state = taskStates.value.get(job.task);
      if (
        taskVersions.value.get(job.task) === job.createAt &&
        state?.initialized
      ) {
        continue;
      }
      if (job.finishAt) {
        taskStates.value.set(
          job.task,
          reactive(new TaskState(job.task)) as TaskState,
        );
        taskVersions.value.set(job.task, job.createAt);
        continue;
      }
      uninitialized.push(job);
    }
    await Promise.all(
      uninitialized.map(async (job) => {
        try {
          const task = await getOrCreateTask(job.task);
          if (!task.initialized) await task.initMeta();
          const currentJob = jobs.value.find((it) => it.task === job.task);
          if (!currentJob || currentJob.createAt !== job.createAt) return;
          const chapters = task.chapters;
          const state = reactive(new TaskState(job.task)) as TaskState;
          state.initChapters(chapters);
          taskStates.value.set(job.task, state);
          taskVersions.value.set(job.task, job.createAt);
          const doneCount = chapters.filter((c) => c.status === 'done').length;
          (job as TranslateJobRecord).progress = {
            finished: doneCount,
            error: 0,
            total: chapters.length,
          };
          if (chapters.length === 0 || doneCount === chapters.length) {
            job.finishAt = Date.now();
          }
        } catch (e) {
          console.warn('任务初始化失败', job.task, e);
        }
      }),
    );
    if (uninitialized.length > 0) runProcessLoop();
  },
  { immediate: true },
);
</script>

<template>
  <div class="layout-content">
    <n-h1>GPT工作区BETA</n-h1>
    <bulletin>
      <n-p>
        支持并发和查看章节分块状态的新GPT工作区。目前处于测试阶段，有问题请在群内反馈。
      </n-p>
    </bulletin>

    <section-header title="翻译器">
      <c-button
        label="添加翻译器"
        :icon="PlusOutlined"
        @action="showWorkerModal = true"
      />
    </section-header>

    <n-flex vertical>
      <c-action-wrapper title="操作" align="center">
        <n-button-group size="small">
          <c-button label="启动全部" :round="false" @action="startAllWorkers" />
          <c-button label="停止全部" :round="false" @action="stopAllWorkers" />
          <c-button-confirm
            hint="真的要清空缓存吗？"
            label="清空缓存"
            :icon="DeleteOutlineOutlined"
            :round="false"
            @action="clearCache"
          />
        </n-button-group>
      </c-action-wrapper>
    </n-flex>

    <n-empty
      v-if="pipelineWorkspace.ref.value.workers.length === 0"
      description="没有翻译器"
    />
    <n-list v-else class="worker-list">
      <vue-draggable
        v-model="pipelineWorkspace.ref.value.workers"
        :animation="150"
        handle=".drag-trigger"
        filter=".is-running"
      >
        <n-list-item
          v-for="w of pipelineWorkspace.ref.value.workers"
          :key="w.id"
          :class="{ 'is-running': workerStates.get(w.id)?.running }"
        >
          <pipeline-worker-card
            :worker="w"
            :running="!!workerStates.get(w.id)?.running"
            :concurrency="
              workerStates.get(w.id)?.concurrency ?? {
                current: 0,
                max: w.concurrency,
              }
            "
            :error-count="workerErrors.get(w.id) ?? 0"
            @start="startWorker"
            @stop="stopWorker"
            @delete="pipelineWorkspace.deleteWorker"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <section-header title="任务队列">
      <c-button
        label="本地书架"
        :icon="BookOutlined"
        @action="showLocalVolumeDrawer = true"
      />
    </section-header>

    <n-flex vertical>
      <c-action-wrapper title="状态">
        <c-radio-group
          v-model:value="taskFilter"
          :options="filterOptions"
          size="small"
        />
      </c-action-wrapper>
      <c-action-wrapper title="操作" align="center">
        <n-button-group size="small">
          <c-button-confirm
            hint="真的要删除筛选出的任务吗？"
            label="删除筛选任务"
            :icon="DeleteOutlineOutlined"
            :round="false"
            @action="deleteAllJobs"
          />
          <c-button
            label="重试失败任务"
            :icon="RefreshOutlined"
            :round="false"
            @action="retryTaskCards"
          />
        </n-button-group>
      </c-action-wrapper>
    </n-flex>
    <n-divider style="margin: 16px 0 8px" />
    <n-empty v-if="filteredJobs.length === 0" description="没有任务" />
    <div v-else class="task-list">
      <pipeline-task-card
        v-for="job of filteredJobs"
        ref="taskCardRefs"
        :key="job.task"
        :job="job"
        :task-state="taskStates.get(job.task)"
        :task-cache-entry="taskCache.get(job.task)"
        @delete="deleteJob"
        @retry="(task: string) => runProcessLoop()"
        @top="
          (task: string) =>
            gptWorkspace.topJob(
              jobs.find((j: { task: string }) => j.task === task)!,
            )
        "
        @bottom="
          (task: string) =>
            gptWorkspace.bottomJob(
              jobs.find((j: { task: string }) => j.task === task)!,
            )
        "
      />
    </div>
  </div>

  <local-volume-list-specific-translation
    v-model:show="showLocalVolumeDrawer"
    type="gpt"
  />
  <gpt-pipeline-worker-modal v-model:show="showWorkerModal" />
</template>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
