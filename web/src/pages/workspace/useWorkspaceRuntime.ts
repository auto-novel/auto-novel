import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { Toast } from '@novelia/web-kit';
import {
  Semaphore,
  OpenAiTranslator,
  SakuraTranslator,
  TranslationPipeline,
} from '@auto-novel/translator';
import type { TranslatorTracker } from '@auto-novel/translator';

import { useWorkspaceStore } from '@/stores';
import { TaskExecutor } from '@/domain/translator/TaskExecutor';
import type { ChapterTranslator } from '@/domain/translator/TaskExecutor';
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
import {
  findHarnessPresetGroup,
  getHarnessModelPreset,
} from '@auto-novel/translator/harness/presets';

/** 每个工作区页面持有独立的执行状态，并在页面卸载时停止执行。 */
export function useWorkspaceRuntime(translatorId: TranslatorId) {
  const isSakura = translatorId === 'sakura';
  const segCacheName: ConstructorParameters<typeof IndexedDbSegmentCache>[0] =
    isSakura ? 'sakura-seg-cache' : 'gpt-seg-cache';

  const workerStore = useWorkspaceStore(isSakura ? 'sakura' : 'gpt-pipeline');
  const jobStore = useWorkspaceStore(translatorId);

  const jobs = computed(() => jobStore.ref.value.jobs);

  /** 同时处理的章节数上限 */
  const GLOBAL_WINDOW = 66;
  /** 同时 fetch 的章节数上限 */
  const FETCH_CONCURRENCY = 1;
  const fetchSemaphore = new Semaphore(FETCH_CONCURRENCY);
  /** 在途队列水位随已启动翻译器的总并发自动调整，预留一倍缓冲。 */
  const pipeline = new TranslationPipeline(
    'auto',
    undefined,
    new IndexedDbSegmentCache(segCacheName),
    isSakura ? 'chapter' : 'segment',
  );

  // ========== 任务状态管理 ==========

  const taskStates = ref(new Map<string, TaskState>());
  const taskCache = new Map<string, TranslationTask>();
  const taskVersions = ref(new Map<string, number>());
  /** 同一版本只初始化一次；跨标签页替换对象不能重建执行状态。 */
  const initializingTasks = new Map<string, { createAt: number }>();

  interface WorkerState {
    running: boolean;
    currentConcurrency: number;
    maxConcurrency: number;
    mode: 'pipeline' | 'harness';
    allowUpload?: boolean;
    translateChapter?: ChapterTranslator;
    controller?: AbortController;
  }
  const workerStates = ref(new Map<string, WorkerState>());
  const workerErrors = computed(() => {
    const errors = new Map<string, number>();
    for (const [, state] of taskStates.value) {
      for (const [, chapterState] of state.chapterStates) {
        for (const seg of chapterState.segments) {
          if (seg.status === 'error' && seg.translatorId) {
            errors.set(
              seg.translatorId,
              (errors.get(seg.translatorId) ?? 0) + 1,
            );
          }
        }
      }
    }
    return errors;
  });
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
    for (const state of workerStates.value.values()) {
      state.controller?.abort();
    }
    processLoopAbortController?.abort();
    processLoopAbortController = null;
    workerStates.value.clear();
  });
  async function getOrCreateTask(taskDesc: string): Promise<TranslationTask> {
    let task = taskCache.get(taskDesc);
    if (!task) {
      const { desc, params } = TranslateTaskDescriptor.parse(taskDesc);
      task = createTranslationTask(desc, translatorId, params);
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
      (!isSakura || !task.needsMetadata || metadata?.settled)
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
    if (!isSakura || !task.needsMetadata || !task.translateMetadata) return;
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

    const processOne = async (worker?: WorkerState) => {
      const workerSignal = worker?.controller?.signal ?? signal;
      while (
        !workerSignal.aborted &&
        (worker ? worker.running : hasRunningWorker())
      ) {
        const item = getNextJob(jobs.value, taskStates.value);
        if (!item) break;

        const { job, chapterId, state } = item;
        const task = await getOrCreateTask(job.task);
        const isCurrentTask = () =>
          taskCache.get(job.task) === task &&
          taskStates.value.get(job.task) === state &&
          !!findCurrentJob(job);
        if (signal.aborted || !isCurrentTask()) continue;

        const executor = new TaskExecutor(
          task,
          worker?.translateChapter ?? pipeline,
          fetchSemaphore,
          () =>
            !workerSignal.aborted &&
            isCurrentTask() &&
            (task.type === 'local' || canUpload()),
        );

        const segmentTracker = state.getChapterState(chapterId);
        if (!segmentTracker) continue;
        await executor
          .executeChapter(
            chapterId,
            {
              onChapterStatus: (cid: string, st: ChapterStatus) => {
                if (isCurrentTask()) state.updateStatus(cid, st);
              },
              onProgress: (finished: number, error: number, total: number) => {
                const currentJob = isCurrentTask()
                  ? findCurrentJob(job)
                  : undefined;
                if (currentJob) {
                  currentJob.progress = { finished, error, total };
                }
              },
              onLog: (msg: string) => console.log(`[${job.task}] ${msg}`),
              segmentTracker,
            },
            workerSignal,
          )
          .then(() => {
            if (isCurrentTask()) updateJobCompletion(job, task, state);
          });
      }
    };

    // 运行中新增的待翻章节（新任务、重试、任务延迟初始化）也要补满窗口，
    // 否则章节并发会一直被卡在循环启动时的待翻章节数。
    const startProcessor = (worker?: WorkerState) => {
      activeProcessors++;
      if (worker) worker.currentConcurrency++;
      processOne(worker).finally(() => {
        activeProcessors--;
        if (worker) worker.currentConcurrency--;
        if (activeProcessors === 0) {
          if (processLoopAbortController === controller) {
            processLoopAbortController = null;
          }
        }
        if (countPendingChapters(jobs.value, taskStates.value) > 0) {
          runProcessLoop();
        }
      });
    };

    const chapterWorkers = [...workerStates.value.values()].filter(
      (state) => state.running && state.translateChapter,
    );
    if (chapterWorkers.length > 0) {
      for (const worker of chapterWorkers) {
        const slots = Math.min(
          worker.maxConcurrency - worker.currentConcurrency,
          GLOBAL_WINDOW - activeProcessors,
          pendingCount,
        );
        for (let i = 0; i < slots; i++) startProcessor(worker);
      }
    } else {
      const spawnCount = Math.min(
        GLOBAL_WINDOW - activeProcessors,
        pendingCount,
      );
      for (let i = 0; i < spawnCount; i++) startProcessor();
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

    const harnessPreset = isSakura
      ? undefined
      : findHarnessPresetGroup((w as GptPipelineWorker).preset);
    const mode = harnessPreset?.mode ?? 'pipeline';
    if (
      [...workerStates.value.values()].some(
        (state) => state.running && state.mode !== mode,
      )
    ) {
      Toast.warning('请先停止正在运行的另一种预设，再切换翻译方式');
      return;
    }

    const state = reactive<WorkerState>({
      running: true,
      currentConcurrency: 0,
      maxConcurrency: w.concurrency ?? 1,
      mode,
      controller: mode === 'harness' ? new AbortController() : undefined,
    });
    workerStates.value.set(workerId, state);

    try {
      if (harnessPreset) {
        const preset = getHarnessModelPreset(
          harnessPreset,
          (w as GptPipelineWorker).model,
        );
        const { createHarnessMode } = await import(
          '@/domain/translator/harness/HarnessMode'
        );
        if (workerStates.value.get(workerId) !== state) return;
        state.translateChapter = createHarnessMode(
          preset,
          (w as GptPipelineWorker).key,
          w.id,
        );
        state.allowUpload = true;
      } else {
        const log = (msg: string) => console.log(`[${w.id}] ${msg}`);
        const t = isSakura
          ? await SakuraTranslator.create({ ...(w as SakuraWorker), log })
          : new OpenAiTranslator({ ...(w as GptPipelineWorker), log });

        if (workerStates.value.get(workerId) !== state) return;

        state.allowUpload = !(t instanceof SakuraTranslator) || t.allowUpload();

        const workerTracker: TranslatorTracker = {
          onConcurrencyChange: (current: number) => {
            state.currentConcurrency = current;
          },
        };
        pipeline.registerTranslator(t, w.concurrency, workerTracker, w.id);
      }

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
    state.controller?.abort();

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
    const state = taskStates.value.get(task);
    const metadata = metadataTasks.get(task);
    // 原文获取阶段可删除；分段准备好后直到保存结束，仍视为执行中。
    const inPipeline = state?.chapters.some(
      (chapter) =>
        chapter.status === 'translating' &&
        state.chapterStates.get(chapter.chapterId)?.ready,
    );
    if (inPipeline || (metadata && !metadata.settled)) {
      Toast.error('任务正在翻译或保存中，请先停止翻译器');
      return;
    }
    jobStore.deleteJob(task);
    clearTaskRuntimeState(task);
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
            const doneCount = chapters.filter(
              (c) => c.status === 'done',
            ).length;
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

  const topJob = (task: string) => {
    const job = jobs.value.find((job) => job.task === task);
    if (job) jobStore.topJob(job);
  };

  const bottomJob = (task: string) => {
    const job = jobs.value.find((job) => job.task === task);
    if (job) jobStore.bottomJob(job);
  };

  return {
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
  };
}
