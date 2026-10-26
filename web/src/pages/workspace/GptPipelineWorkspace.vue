<script lang="ts" setup>
import {
  Toast,
  XButton,
  XConfirmDialog,
  XDropdownMenu,
  XDropdownMenuItem,
} from '@novelia/web-kit';
import {
  BookOutlined,
  DeleteOutlineOutlined,
  MoreVertOutlined,
  PlayArrowOutlined,
  PlusOutlined,
  RefreshOutlined,
  StopOutlined,
} from '@vicons/material';
import { VueDraggable } from 'vue-draggable-plus';
import {
  allowModels,
  Semaphore,
  OpenAiTranslator,
  SakuraTranslator,
  TranslationPipeline,
} from '@auto-novel/translator';
import type { TranslatorTracker } from '@auto-novel/translator';

import { forumPostUrls, siteUrls } from '@/config';
import { useWorkspaceStore } from '@/stores';
import { TaskExecutor } from '@/domain/translator/TaskExecutor';
import { IndexedDbSegmentCache } from '@/domain/translator/IndexedDbSegmentCache';
import { createTranslationTask } from '@/domain/translator/TranslationTask/createTranslationTask';
import type {
  TranslationTask,
  TranslatorId,
} from '@/domain/translator/TranslationTask/types';
import { TaskState } from '@/domain/translator/TaskState';
import type { ChapterStatus } from '@/domain/translator/TaskState';
import type {
  GptPipelineWorker,
  SakuraWorker,
  TranslateJob,
  TranslateJobRecord,
} from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';
import PipelineTaskCard from './components/PipelineTaskCard.vue';

const props = defineProps<{ translatorId: TranslatorId }>();
const isSakura = computed(() => props.translatorId === 'sakura');
const segCacheName = isSakura.value ? 'sakura-seg-cache' : 'gpt-seg-cache';

const workerStore = useWorkspaceStore(
  isSakura.value ? 'sakura' : 'gpt-pipeline',
);
const jobStore = useWorkspaceStore(props.translatorId);

const jobs = computed(() => jobStore.ref.value.jobs);

const showWorkerDialog = ref(false);
const showLocalVolumeDrawer = ref(false);
const showDeleteJobsDialog = ref(false);

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
  new IndexedDbSegmentCache(segCacheName),
  isSakura.value ? 'chapter' : 'segment',
);

// ========== 任务状态管理 ==========

const taskStates = ref(new Map<string, TaskState>());
const taskCache = new Map<string, TranslationTask>();
const taskVersions = ref(new Map<string, number>());
/** 同一版本只初始化一次；跨标签页替换对象不能重建执行状态。 */
const initializingTasks = new Map<string, { createAt: number }>();

interface WorkerState {
  running: boolean;
  concurrency: { current: number; max: number };
  allowUpload?: boolean;
}
const workerStates = ref(new Map<string, WorkerState>());
const hasStartedWorkers = computed(() =>
  workerStore.ref.value.workers.some(
    (w) => workerStates.value.get(w.id)?.running,
  ),
);
const hasStoppedWorkers = computed(() =>
  workerStore.ref.value.workers.some(
    (w) => !workerStates.value.get(w.id)?.running,
  ),
);
const showClearCacheDialog = ref(false);
const clearingCache = ref(false);
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
interface MetadataState {
  task: TranslationTask;
  createAt: number;
  controller: AbortController;
  settled: boolean;
}
/** 元数据独立于章节窗口；已结束的尝试保留到任务清除，避免重复上传。 */
const metadataTasks = new Map<string, MetadataState>();
const preparationTasks = new Map<
  string,
  { controller: AbortController; settled: boolean }
>();

let processLoopAbortController: AbortController | null = null;
let activeProcessors = 0;

onUnmounted(() => {
  initializingTasks.clear();
  abortMetadataTasks();
  abortPreparationTasks();
  pipeline.clearLoops();
  pipeline.queue.clear();
  processLoopAbortController?.abort();
  processLoopAbortController = null;
  executingTasks.clear();
  workerStates.value.clear();
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
    task = createTranslationTask(desc, props.translatorId, params);
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
    if (taskCache.get(job.task)?.needsPreparation) continue;
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
    if (taskCache.get(job.task)?.needsPreparation) continue;
    const state = taskStatesMap.get(job.task);
    if (!state) continue;
    for (const ch of state.chapters) {
      if (ch.status === 'pending') count++;
    }
  }
  return count;
}

function hasRunningWorker(): boolean {
  return [...workerStates.value.values()].some(
    (s) => s.running && s.allowUpload !== undefined,
  );
}

function canUpload(): boolean {
  return (
    hasRunningWorker() &&
    [...workerStates.value.values()].every(
      (s) => !s.running || s.allowUpload !== false,
    )
  );
}

function abortMetadataTasks(): void {
  for (const [key, state] of metadataTasks) {
    if (state.settled) continue;
    state.controller.abort();
    metadataTasks.delete(key);
  }
}

function clearTaskRuntimeState(task: string): void {
  initializingTasks.delete(task);
  preparationTasks.get(task)?.controller.abort();
  preparationTasks.delete(task);
  metadataTasks.get(task)?.controller.abort();
  metadataTasks.delete(task);
  taskStates.value.delete(task);
  taskCache.delete(task);
  taskVersions.value.delete(task);
}

// ========== 全局处理循环 ==========

/**
 * 其他标签页修改工作区时，localStorage 同步会整体替换 jobs 里的对象，
 * 执行中持有的 job 引用随之失效。写回状态前必须重新取当前对象。
 */
function findCurrentJob(job: TranslateJob): TranslateJobRecord | undefined {
  return jobs.value.find(
    (it) => it.task === job.task && it.createAt === job.createAt,
  );
}

function updateJobCompletion(
  job: TranslateJob,
  task: TranslationTask,
  state: TaskState,
): void {
  const currentJob = findCurrentJob(job);
  if (
    !currentJob ||
    task.needsPreparation ||
    taskCache.get(job.task) !== task ||
    taskStates.value.get(job.task) !== state
  ) {
    return;
  }
  const metadata = metadataTasks.get(job.task);
  if (
    state.chapters.every((chapter) => chapter.status === 'done') &&
    (!isSakura.value || !task.needsMetadata || metadata?.settled)
  ) {
    currentJob.finishAt = Date.now();
  }
}

function abortPreparationTasks(): void {
  for (const [key, preparation] of preparationTasks) {
    preparation.controller.abort();
    // 等待插件返回后再释放占位
    if (preparation.settled) preparationTasks.delete(key);
  }
}

function prepareTaskOnce(
  job: TranslateJob,
  task: TranslationTask,
  state: TaskState,
): void {
  if (
    !task.prepareExecution ||
    !canUpload() ||
    preparationTasks.has(job.task)
  ) {
    return;
  }
  const preparation = { controller: new AbortController(), settled: false };
  preparationTasks.set(job.task, preparation);
  const signal = preparation.controller.signal;
  const canPrepare = () =>
    !signal.aborted &&
    preparationTasks.get(job.task) === preparation &&
    taskCache.get(job.task) === task &&
    taskStates.value.get(job.task) === state &&
    !!findCurrentJob(job) &&
    canUpload();
  task
    .prepareExecution({
      signal,
      canUpload: canPrepare,
      onLog: (message) => console.log(`[${job.task}] ${message}`),
    })
    .then(() => {
      if (!canPrepare()) return;
      state.initChapters(task.chapters);
      const currentJob = findCurrentJob(job)!;
      currentJob.progress = {
        finished: task.chapters.filter((chapter) => chapter.status === 'done')
          .length,
        error: 0,
        total: task.chapters.length,
      };
      updateJobCompletion(job, task, state);
    })
    .catch((error) => {
      if (!signal.aborted) console.warn(`[${job.task}] 任务准备失败`, error);
    })
    .finally(() => {
      if (preparationTasks.get(job.task) !== preparation) return;
      preparation.settled = true;
      if (signal.aborted || !task.needsPreparation) {
        preparationTasks.delete(job.task);
        runProcessLoop();
      }
    });
}

/**
 * 翻译标题、简介和目录。与旧版工作区一致，GPT 不翻译元数据。
 * 不阻塞章节翻译，失败只记录日志。
 */
function translateMetadataOnce(
  job: TranslateJob,
  task: TranslationTask,
  state: TaskState,
): void {
  if (!isSakura.value || !task.needsMetadata || !task.translateMetadata) return;
  if (!canUpload() || metadataTasks.has(job.task)) return;
  const metadata: MetadataState = {
    task,
    createAt: job.createAt,
    controller: new AbortController(),
    settled: false,
  };
  metadataTasks.set(job.task, metadata);
  const signal = metadata.controller.signal;
  const canUploadMetadata = () =>
    !signal.aborted &&
    metadataTasks.get(job.task) === metadata &&
    taskCache.get(job.task) === metadata.task &&
    jobs.value.some(
      (it) => it.task === job.task && it.createAt === metadata.createAt,
    ) &&
    canUpload();

  // 简介可能含换行，按行翻译后再按原行数拼回
  const translateTexts = async (texts: string[]) => {
    signal.throwIfAborted();
    const lineCounts = texts.map((text) => text.split('\n').length);
    // 分段失败时 pipeline 会回退为原文，不能把原文当译文上传
    let failed = false;
    const lines = (
      await pipeline.translate(
        texts.join('\n'),
        task.glossary,
        undefined,
        signal,
        { onSegError: () => (failed = true) },
      )
    ).split('\n');
    signal.throwIfAborted();
    if (failed) throw new Error('分段翻译失败');
    if (
      lines.length !== lineCounts.reduce((total, count) => total + count, 0)
    ) {
      throw new Error('元数据译文行数不匹配');
    }
    return lineCounts.map((count) => lines.splice(0, count).join('\n'));
  };
  task
    .translateMetadata(translateTexts, signal, canUploadMetadata)
    .then(() => {
      if (!signal.aborted && metadataTasks.get(job.task) === metadata) {
        console.log(`[${job.task}] 元数据翻译完成`);
      }
    })
    .catch((e) => {
      if (!signal.aborted) console.warn(`[${job.task}] 元数据翻译失败`, e);
    })
    .finally(() => {
      if (metadataTasks.get(job.task) !== metadata) return;
      metadata.settled = true;
      updateJobCompletion(job, task, state);
    });
}

function runProcessLoop(): void {
  if (!hasRunningWorker()) return;

  for (const job of jobs.value) {
    if (job.finishAt) continue;
    const task = taskCache.get(job.task);
    const state = taskStates.value.get(job.task);
    if (task?.initialized && state?.initialized) {
      if (task.needsPreparation) {
        prepareTaskOnce(job, task, state);
        continue;
      }
      translateMetadataOnce(job, task, state);
    }
  }

  const pendingCount = countPendingChapters(jobs.value, taskStates.value);
  if (pendingCount === 0) return;
  processLoopAbortController ??= new AbortController();
  const controller = processLoopAbortController;
  const signal = controller.signal;

  const processOne = async () => {
    while (!signal.aborted && hasRunningWorker()) {
      const item = getNextJob(jobs.value, taskStates.value);
      if (!item) break;

      const { job, chapterId, state } = item;
      executingTasks.add(job.task);

      const task = await getOrCreateTask(job.task);
      const executor = new TaskExecutor(
        task,
        pipeline,
        fetchSemaphore,
        () =>
          !signal.aborted &&
          taskCache.get(job.task) === task &&
          taskStates.value.get(job.task) === state &&
          !!findCurrentJob(job) &&
          canUpload(),
      );

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
              const currentJob = findCurrentJob(job);
              if (currentJob) {
                currentJob.progress = { finished, error, total };
              }
            },
            onLog: (msg: string) => console.log(`[${job.task}] ${msg}`),
            segmentTracker,
          },
          signal,
        )
        .then(() => {
          if (taskStates.value.get(job.task) !== state) return;
          const allProcessed = state.chapters.every(
            (c) => c.status === 'done' || c.status === 'error',
          );
          if (allProcessed) {
            executingTasks.delete(job.task);
          }
          updateJobCompletion(job, task, state);
        });
    }
  };

  // 运行中新增的待翻章节（新任务、重试、任务延迟初始化）也要补满窗口，
  // 否则章节并发会一直被卡在循环启动时的待翻章节数。
  const spawnCount = Math.min(GLOBAL_WINDOW - activeProcessors, pendingCount);
  for (let i = 0; i < spawnCount; i++) {
    activeProcessors++;
    processOne().finally(() => {
      activeProcessors--;
      if (activeProcessors === 0) {
        executingTasks.clear();
        if (processLoopAbortController === controller) {
          processLoopAbortController = null;
        }
      }
      if (countPendingChapters(jobs.value, taskStates.value) > 0) {
        runProcessLoop();
      }
    });
  }
}

// ========== Worker 生命周期管理 ==========

const startWorker = async (workerId: string) => {
  if (workerStates.value.get(workerId)?.running) return;

  const w = workerStore.ref.value.workers.find((w) => w.id === workerId);
  if (!w) {
    Toast.error(`翻译器 ${workerId} 不存在`);
    return;
  }

  const state = reactive<WorkerState>({
    running: true,
    concurrency: { current: 0, max: w.concurrency ?? 1 },
  });
  workerStates.value.set(workerId, state);

  try {
    const log = (msg: string) => console.log(`[${w.id}] ${msg}`);
    const t = isSakura.value
      ? await SakuraTranslator.create({ ...(w as SakuraWorker), log })
      : new OpenAiTranslator({ ...(w as GptPipelineWorker), log });

    if (workerStates.value.get(workerId) !== state) return;

    state.allowUpload = !(t instanceof SakuraTranslator) || t.allowUpload();

    const workerTracker: TranslatorTracker = {
      onConcurrencyChange: (current: number, max: number) => {
        state.concurrency = { current, max };
      },
    };
    pipeline.registerTranslator(t, w.concurrency, workerTracker, w.id);

    runProcessLoop();
  } catch (e) {
    if (workerStates.value.get(workerId) !== state) return;
    stopWorker(workerId);
    Toast.error(`翻译器启动失败：${e}`);
  }
};

const stopWorker = (workerId: string) => {
  const state = workerStates.value.get(workerId);
  if (!state?.running) return;

  pipeline.unregisterTranslator(workerId);

  workerStates.value.set(workerId, { ...state, running: false });

  if ([...workerStates.value.values()].every((s) => !s.running)) {
    abortMetadataTasks();
    abortPreparationTasks();
    processLoopAbortController?.abort();
    processLoopAbortController = null;
    pipeline.queue.clear();
  }
};

const startAllWorkers = () => {
  for (const w of workerStore.ref.value.workers) startWorker(w.id);
};

const stopAllWorkers = () => {
  for (const w of workerStore.ref.value.workers) stopWorker(w.id);
};

const deleteJob = (task: string) => {
  if (executingTasks.has(task)) {
    Toast.error('任务正在翻译中');
    return;
  }
  jobStore.deleteJob(task);
  clearTaskRuntimeState(task);
};

const deleteAllJobs = () => {
  filteredJobs.value.forEach((j) => deleteJob(j.task));
  showDeleteJobsDialog.value = false;
};

const taskCardRefs = ref<InstanceType<typeof PipelineTaskCard>[]>([]);
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
  if (!hasFailed) {
    Toast.info('没有需要重试的失败任务');
  }
}

const clearCache = async () => {
  if (clearingCache.value) return;
  clearingCache.value = true;
  const success = await Toast.promise(
    new IndexedDbSegmentCache(segCacheName).clear().then(() => true),
    {
      success: '缓存清除成功',
      error: '缓存清除失败',
    },
  );
  clearingCache.value = false;
  if (success) showClearCacheDialog.value = false;
};

watch(
  () => [...jobs.value],
  async (workspaceJobs) => {
    const uninitialized: {
      job: TranslateJob;
      initialization: { createAt: number };
    }[] = [];
    const activeTasks = new Set(workspaceJobs.map((job) => job.task));
    const knownTasks = new Set([
      ...taskStates.value.keys(),
      ...taskCache.keys(),
      ...taskVersions.value.keys(),
      ...initializingTasks.keys(),
      ...metadataTasks.keys(),
      ...preparationTasks.keys(),
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
        (state?.initialized || initializingTasks.has(job.task))
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
      const initialization = { createAt: job.createAt };
      taskVersions.value.set(job.task, job.createAt);
      initializingTasks.set(job.task, initialization);
      uninitialized.push({ job, initialization });
    }
    await Promise.all(
      uninitialized.map(async ({ job, initialization }) => {
        try {
          const task = await getOrCreateTask(job.task);
          if (!task.initialized) await task.initMeta();
          if (
            initializingTasks.get(job.task) !== initialization ||
            taskCache.get(job.task) !== task
          ) {
            return;
          }
          const currentJob = findCurrentJob(job);
          if (!currentJob) return;
          const chapters = task.chapters;
          const state = reactive(new TaskState(job.task)) as TaskState;
          state.initChapters(chapters);
          taskStates.value.set(job.task, state);
          taskVersions.value.set(job.task, job.createAt);
          const doneCount = chapters.filter((c) => c.status === 'done').length;
          currentJob.progress = {
            finished: doneCount,
            error: 0,
            total: chapters.length,
          };
          updateJobCompletion(job, task, state);
        } catch (e) {
          console.warn('任务初始化失败', job.task, e);
        } finally {
          if (initializingTasks.get(job.task) === initialization) {
            initializingTasks.delete(job.task);
          }
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
    <n-h1>{{ isSakura ? 'Sakura' : 'GPT' }}工作区</n-h1>
    <bulletin>
      <n-p>
        支持并发和查看章节分块状态的新工作区。目前处于测试阶段，有问题请在群内反馈。
      </n-p>
      <template v-if="isSakura">
        <n-flex>
          <n-a
            :href="forumPostUrls.sakuraDeployGuide"
            target="_blank"
            rel="noopener noreferrer"
          >
            本地部署教程
          </n-a>
          /
          <span>
            <n-a
              :href="forumPostUrls.sakuraAutoDlGuide"
              target="_blank"
              rel="noopener noreferrer"
            >
              AutoDL教程
            </n-a>
            :
            <n-a
              href="https://www.autodl.com/console/instance/list"
              target="_blank"
              rel="noopener noreferrer"
            >
              控制台
            </n-a>
          </span>
          /
          <n-a
            :href="siteUrls.sakuraMonitor"
            target="_blank"
            rel="noopener noreferrer"
          >
            共享 Sakura 当前负载
          </n-a>
        </n-flex>
        <n-p>允许上传的模型如下，禁止一切试图突破上传检查的操作。</n-p>
        <n-ul>
          <n-li v-for="({ repo }, model) in allowModels" :key="model">
            [
            <n-a
              :href="`https://huggingface.co/${repo}/blob/main/${model}.gguf`"
              target="_blank"
              rel="noopener noreferrer"
            >
              HF
            </n-a>
            /
            <n-a
              :href="`https://hf-mirror.com/${repo}/blob/main/${model}.gguf`"
              target="_blank"
              rel="noopener noreferrer"
            >
              国内镜像
            </n-a>
            ]
            {{ model }}
          </n-li>
        </n-ul>
      </template>
      <template v-else>
        <n-flex>
          <n-a
            :href="forumPostUrls.usageGuide"
            target="_blank"
            rel="noopener noreferrer"
          >
            使用教程
          </n-a>
          /
          <n-a
            href="https://chat.deepseek.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            DeepSeek Chat
          </n-a>
          /
          <n-a
            href="https://platform.deepseek.com/usage"
            target="_blank"
            rel="noopener noreferrer"
          >
            DeepSeek API
          </n-a>
        </n-flex>
        <n-p>不再支持GPT web，推荐使用deepseek API，价格很低。</n-p>
        <n-p>本地小说支持韩语等其他语种，网络小说/文库小说暂时只允许日语。</n-p>
      </template>
    </bulletin>

    <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 flex items-center gap-2 text-base font-medium">
        <span
          class="w-1 self-stretch rounded-full bg-primary"
          aria-hidden="true"
        />
        翻译器
      </h2>
      <div class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
        <XButton
          v-if="workerStore.ref.value.workers.length"
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          :disabled="!hasStoppedWorkers"
          @click="startAllWorkers"
        >
          <PlayArrowOutlined class="size-3.5" aria-hidden="true" />
          全部启动
        </XButton>
        <XButton
          v-if="workerStore.ref.value.workers.length"
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          :disabled="!hasStartedWorkers"
          @click="stopAllWorkers"
        >
          <StopOutlined class="size-3.5" aria-hidden="true" />
          全部停止
        </XButton>
        <XButton
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          @click="showWorkerDialog = true"
        >
          <PlusOutlined class="size-3.5" aria-hidden="true" />
          添加
        </XButton>
        <XDropdownMenu v-if="workerStore.ref.value.workers.length" align="end">
          <template #trigger>
            <XButton
              color="neutral"
              variant="ghost"
              size="icon-xs"
              class="text-ink"
              aria-label="更多翻译器操作"
              title="更多翻译器操作"
            >
              <MoreVertOutlined class="size-4" aria-hidden="true" />
            </XButton>
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

    <n-empty
      v-if="workerStore.ref.value.workers.length === 0"
      description="没有翻译器"
    />
    <n-list v-else class="worker-list">
      <vue-draggable
        v-model="workerStore.ref.value.workers"
        :animation="150"
        handle=".drag-trigger"
        filter=".is-running"
      >
        <n-list-item
          v-for="w of workerStore.ref.value.workers"
          :key="w.id"
          :class="{ 'is-running': workerStates.get(w.id)?.running }"
        >
          <PipelineWorkerCard
            :translator-id="translatorId"
            :worker="w"
            :running="!!workerStates.get(w.id)?.running"
            :concurrency="
              workerStates.get(w.id)?.concurrency ?? {
                current: 0,
                max: w.concurrency ?? 1,
              }
            "
            :error-count="workerErrors.get(w.id) ?? 0"
            @start="startWorker"
            @stop="stopWorker"
            @delete="workerStore.deleteWorker"
          />
        </n-list-item>
      </vue-draggable>
    </n-list>

    <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 flex items-center gap-2 text-base font-medium">
        <span
          class="w-1 self-stretch rounded-full bg-primary"
          aria-hidden="true"
        />
        任务队列
      </h2>
      <div class="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
        <XButton
          v-if="filteredJobs.length"
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          @click="showDeleteJobsDialog = true"
        >
          <DeleteOutlineOutlined class="size-3.5" aria-hidden="true" />
          删除筛选
        </XButton>
        <XButton
          v-if="hasFailedTasks"
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          @click="retryTaskCards"
        >
          <RefreshOutlined class="size-3.5" aria-hidden="true" />
          重试失败
        </XButton>
        <XButton
          color="neutral"
          variant="ghost"
          size="tiny"
          class="text-ink"
          @click="showLocalVolumeDrawer = true"
        >
          <BookOutlined class="size-3.5" aria-hidden="true" />
          本地书架
        </XButton>
      </div>
    </div>

    <n-flex vertical>
      <c-action-wrapper title="状态">
        <c-radio-group
          v-model:value="taskFilter"
          :options="filterOptions"
          size="small"
        />
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
        :translator-id="translatorId"
        :task-state="taskStates.get(job.task)"
        :task-cache-entry="taskCache.get(job.task)"
        @delete="deleteJob"
        @retry="(task: string) => runProcessLoop()"
        @top="
          (task: string) =>
            jobStore.topJob(
              jobs.find((j: { task: string }) => j.task === task)!,
            )
        "
        @bottom="
          (task: string) =>
            jobStore.bottomJob(
              jobs.find((j: { task: string }) => j.task === task)!,
            )
        "
      />
    </div>
  </div>

  <XConfirmDialog
    v-model:open="showDeleteJobsDialog"
    title="删除筛选任务"
    description="真的要删除筛选出的任务吗？"
    confirm-label="删除"
    danger
    @confirm="deleteAllJobs"
  />
  <XConfirmDialog
    v-model:open="showClearCacheDialog"
    title="清空缓存"
    description="真的要清空缓存吗？"
    confirm-label="清空缓存"
    :loading="clearingCache"
    danger
    @confirm="clearCache"
  />
  <local-volume-list-specific-translation
    v-model:show="showLocalVolumeDrawer"
    :type="translatorId"
  />
  <SakuraWorkerDialog v-if="isSakura" v-model:show="showWorkerDialog" />
  <GptPipelineWorkerDialog v-else v-model:show="showWorkerDialog" />
</template>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
