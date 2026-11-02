import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { Toast } from '@novelia/web-kit';
import { createTranslator, TranslationPipeline } from '@auto-novel/translator';
import type { TranslationWork } from '@auto-novel/translator';

import { useWorkspaceStore } from '@/stores';
import {
  TaskExecutor,
  TaskLifecycle,
  IndexedDbSegmentCache,
  createTranslationTask,
  TaskState,
} from '@/domain/translator';
import type { TranslationTask, ChapterStatus } from '@/domain/translator';
import { toTranslatorConfig } from '@/model/Translator';
import type {
  TranslateJob,
  TranslateJobRecord,
  WorkspaceTranslatorId,
} from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';

import { useWorkspaceLog } from './useWorkspaceLog';

/** 每个工作区页面持有独立的执行状态，并在页面卸载时停止执行。 */
export function useWorkspaceRuntime(translatorId: WorkspaceTranslatorId) {
  const isSakura = translatorId === 'sakura';
  const segCacheName: ConstructorParameters<typeof IndexedDbSegmentCache>[0] =
    isSakura ? 'sakura-seg-cache' : 'gpt-seg-cache';

  const workerStore = useWorkspaceStore(isSakura ? 'sakura' : 'gpt-pipeline');
  const jobStore = useWorkspaceStore(translatorId);

  const jobs = computed(() => jobStore.ref.value.jobs);
  const { logs, appendLog, clearLogs } = useWorkspaceLog();
  const logTask = (task: string, message: string, warn = false) =>
    appendLog(
      jobs.value.find((job) => job.task === task)?.description || task,
      message,
      warn ? 'warn' : 'info',
    );

  const segmentCache = new IndexedDbSegmentCache(segCacheName);
  const clearTranslationCache = (): Promise<void> => segmentCache.clear();

  /** 每类输入的队列水位跟随已注册翻译器总并发，预留一倍缓冲，独立背压。 */
  const pipeline = new TranslationPipeline({
    segmentLength: isSakura ? 500 : undefined,
    cache: segmentCache,
  });

  // ========== 任务状态管理 ==========

  const taskStates = ref(new Map<string, TaskState>());
  const taskCache = new Map<string, TranslationTask>();
  const taskLifecycles = new Map<string, TaskLifecycle>();
  /** 同一版本只初始化一次；跨标签页替换对象不能重建执行状态。 */
  const initializingTasks = new Map<string, AbortController>();
  const initializationErrors = new Set<string>();

  interface WorkerState {
    running: boolean;
    currentConcurrency: number;
    trusted?: boolean;
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
  let trustedInputsController = new AbortController();

  let processLoopAbortController: AbortController | null = null;
  let disposed = false;

  onUnmounted(() => {
    disposed = true;
    for (const lifecycle of taskLifecycles.values()) lifecycle.abort();
    taskLifecycles.clear();
    abortInitializations();
    processLoopAbortController?.abort();
    pipeline.dispose();
    workerStates.value.clear();
  });

  function getOrCreateTask(taskDesc: string): TranslationTask {
    let task = taskCache.get(taskDesc);
    if (!task) {
      const { desc, params } = TranslateTaskDescriptor.parse(taskDesc);
      task = createTranslationTask(desc, translatorId, params);
      taskCache.set(taskDesc, task);
    }
    return task;
  }

  /** 只枚举，不修改状态；取任务和判断是否还有任务共用同一筛选。 */
  function* schedulableUnits() {
    for (const job of jobs.value) {
      if (job.finishAt) continue;
      const task = taskCache.get(job.task);
      if (!task || !task.initialized || !canRunTask(task)) continue;
      const state = taskStates.value.get(job.task);
      if (!state) continue;
      for (const unit of state.units) {
        if (unit.status === 'pending') yield { job, unit, state };
      }
    }
  }

  function hasRunningWorker(): boolean {
    return [...workerStates.value.values()].some(
      (s) => s.running && s.trusted !== undefined,
    );
  }

  function canRunTask(task: TranslationTask): boolean {
    return task.type === 'local'
      ? hasRunningWorker()
      : [...workerStates.value.values()].some(
          (state) => state.running && state.trusted === true,
        );
  }

  function abortInitializations(remoteOnly = false): void {
    for (const [key, controller] of initializingTasks) {
      if (remoteOnly && taskCache.get(key)?.type === 'local') continue;
      controller.abort();
      initializingTasks.delete(key);
      // 不复用可能仍在等待插件返回的旧初始化快照。
      taskCache.delete(key);
    }
  }

  /** 仅加载即将执行的任务；上一任务还有待处理/在途单元时不预取目录。 */
  function initializeNextTask(): void {
    if (initializingTasks.size) return;
    for (const job of jobs.value) {
      if (job.finishAt || initializationErrors.has(job.task)) continue;
      let task: TranslationTask;
      try {
        task = getOrCreateTask(job.task);
      } catch (error) {
        reportInitializationError(job, error);
        continue;
      }
      if (!canRunTask(task)) continue;
      const state = taskStates.value.get(job.task);
      if (state?.initialized) {
        if (
          state.units.some(
            (unit) =>
              unit.status === 'pending' || unit.status === 'translating',
          )
        )
          return;
        continue;
      }
      const controller = new AbortController();
      initializingTasks.set(job.task, controller);
      void initializeTask(job, taskLifecycles.get(job.task)!, controller);
      return;
    }
  }

  function clearTaskRuntimeState(task: string): void {
    taskLifecycles.get(task)?.abort();
    taskLifecycles.delete(task);
    initializingTasks.get(task)?.abort();
    initializingTasks.delete(task);
    initializationErrors.delete(task);
    taskStates.value.delete(task);
    taskCache.delete(task);
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
      taskCache.get(job.task) !== task ||
      taskStates.value.get(job.task) !== state
    ) {
      return;
    }
    if (
      state.initialized &&
      state.units.every((unit) => unit.status === 'done')
    ) {
      currentJob.finishAt = Date.now();
    }
    runProcessLoop();
  }

  function runProcessLoop(): void {
    if (disposed || !hasRunningWorker()) return;

    initializeNextTask();

    // 停止后也必须等旧 run 退出，防止重新启动时重复拉取或覆盖章节状态。
    if (processLoopAbortController) return;
    if (schedulableUnits().next().done) return;
    const controller = new AbortController();
    processLoopAbortController = controller;
    const signal = controller.signal;
    // 每轮只转发一次取消；可信翻译器恢复时可在本轮内创建新的可信任务组。
    signal.addEventListener('abort', () => trustedInputsController.abort(), {
      once: true,
    });

    /** 取下一个翻译单元；没有可交给当前翻译器的单元时返回 undefined。 */
    const nextWork = async (): Promise<
      | {
          work: TranslationWork;
          signal: AbortSignal;
        }
      | undefined
    > => {
      // 跳过缺少可信翻译器的远程任务，仍可继续处理本地任务。
      while (!signal.aborted && hasRunningWorker()) {
        const item = schedulableUnits().next().value;
        if (!item) return undefined;

        const { job, unit, state } = item;
        const { chapterId } = unit;
        state.updateStatus(chapterId, 'translating');
        const task = getOrCreateTask(job.task);
        const isCurrentTask = () =>
          !disposed &&
          taskCache.get(job.task) === task &&
          taskStates.value.get(job.task) === state &&
          !!findCurrentJob(job);
        if (!isCurrentTask()) continue;
        if (signal.aborted || !canRunTask(task)) {
          state.updateStatus(chapterId, 'pending');
          if (signal.aborted) return undefined;
          continue;
        }

        if (task.type !== 'local' && trustedInputsController.signal.aborted) {
          trustedInputsController = new AbortController();
        }
        const inputSignal = taskLifecycles
          .get(job.task)!
          .signalFor(
            task.type === 'local' ? signal : trustedInputsController.signal,
          );
        const executor = new TaskExecutor(task);
        const segmentTracker = state.getChapterState(chapterId);
        if (!segmentTracker) continue;
        const work = await executor.prepareUnit(
          unit,
          {
            onChapterStatus: (cid: string, st: ChapterStatus) => {
              if (!isCurrentTask()) return;
              state.updateStatus(cid, st);
              findCurrentJob(job)!.progress = state.progress;
            },
            onLog: (msg: string) => {
              if (isCurrentTask()) logTask(job.task, msg);
            },
            segmentTracker,
          },
          inputSignal,
        );
        if (!work) {
          if (isCurrentTask()) updateJobCompletion(job, task, state);
          continue;
        }
        return {
          signal: inputSignal,
          work: {
            ...work,
            onComplete: async (result) => {
              await work.onComplete(result);
              if (isCurrentTask()) updateJobCompletion(job, task, state);
            },
            onError: async (error) => {
              await work.onError(error);
              if (isCurrentTask()) updateJobCompletion(job, task, state);
            },
            onAbort: async () => {
              await work.onAbort();
              if (isCurrentTask()) updateJobCompletion(job, task, state);
            },
          },
        };
      }
      return undefined;
    };

    void (async () => {
      try {
        // 推模型：投递一个翻译单元再取下一个，队列满时 submit 自己等待。
        for (;;) {
          const input = await nextWork();
          if (!input) break;
          try {
            await pipeline.submit(input.work, input.signal);
          } catch (error) {
            // 唯一可信翻译器停止只取消受限输入，不能连带中断本地章节。
            if (!input.signal.aborted || signal.aborted) throw error;
          }
        }
        await pipeline.drain();
      } finally {
        // 出错或取消时停掉在途输入，并等待结算回调收尾。
        controller.abort();
        await pipeline.drain().catch(() => {});
      }
    })()
      .catch((error) => {
        if (!signal.aborted) {
          appendLog('工作区', `翻译流水线失败：${error}`, 'warn');
          console.warn('翻译流水线失败', error);
        }
      })
      .finally(() => {
        if (processLoopAbortController !== controller) return;
        processLoopAbortController = null;
        // 本轮没有更多可做的章节，但任务可能新增或重试章节。
        runProcessLoop();
      });
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
      currentConcurrency: 0,
    });
    workerStates.value.set(workerId, state);
    initializationErrors.clear();

    try {
      const secrets = 'key' in w ? [w.key] : [];
      const log = (msg: string) => appendLog(w.id, msg, 'info', secrets);
      log('正在启动翻译器');
      const t = await createTranslator({
        ...toTranslatorConfig(translatorId, w),
        log,
      });

      if (workerStates.value.get(workerId) !== state) return;

      state.trusted = t.trusted === true;
      if (!t.trusted)
        log(`翻译器仅可用于本地翻译：${t.untrustedReason ?? '未通过可信检查'}`);

      pipeline.registerTranslator(t, {
        concurrency: w.concurrency,
        onActiveCountChange: (activeCount) => {
          state.currentConcurrency = activeCount;
        },
        id: w.id,
      });
      log('翻译器已启动');

      runProcessLoop();
    } catch (e) {
      if (workerStates.value.get(workerId) !== state) return;
      stopWorker(workerId);
      appendLog(
        w.id,
        `翻译器启动失败：${e}`,
        'warn',
        'key' in w ? [w.key] : [],
      );
      Toast.error(`翻译器启动失败：${e}`);
    }
  };

  const stopWorker = (workerId: string) => {
    const state = workerStates.value.get(workerId);
    if (!state?.running) return;

    pipeline.unregisterTranslator(workerId);
    appendLog(workerId, '翻译器已停止');

    workerStates.value.set(workerId, { ...state, running: false });

    if (
      ![...workerStates.value.values()].some(
        (s) => s.running && s.trusted === true,
      )
    ) {
      trustedInputsController.abort();
      abortInitializations(true);
    }

    if ([...workerStates.value.values()].every((s) => !s.running)) {
      abortInitializations();
      processLoopAbortController?.abort();
      pipeline.dispose();
    }
    runProcessLoop();
  };

  const startAllWorkers = () => {
    for (const w of workerStore.ref.value.workers) startWorker(w.id);
  };

  const stopAllWorkers = () => {
    for (const w of workerStore.ref.value.workers) stopWorker(w.id);
  };

  const deleteJob = (task: string) => {
    const state = taskStates.value.get(task);

    // 原文获取阶段可删除；分段准备好后直到保存结束，仍视为执行中。
    const inPipeline = state?.units.some(
      (chapter) =>
        chapter.status === 'translating' &&
        state.chapterStates.get(chapter.chapterId)?.ready,
    );
    if (inPipeline) {
      Toast.error('任务正在翻译或保存中，请先停止翻译器');
      return;
    }
    jobStore.deleteJob(task);
    clearTaskRuntimeState(task);
  };

  function reportInitializationError(job: TranslateJob, error: unknown): void {
    initializationErrors.add(job.task);
    logTask(job.task, `任务初始化失败：${error}`, true);
    console.warn('任务初始化失败', job.task, error);
  }

  async function initializeTask(
    job: TranslateJob,
    lifecycle: TaskLifecycle,
    controller: AbortController,
  ): Promise<void> {
    const signal = lifecycle.signalFor(controller.signal);
    try {
      const task = getOrCreateTask(job.task);
      signal.throwIfAborted();
      await task.initialize({
        signal,
        onLog: (message) => {
          if (!signal.aborted) logTask(job.task, message);
        },
      });
      if (
        signal.aborted ||
        initializingTasks.get(job.task) !== controller ||
        taskCache.get(job.task) !== task
      ) {
        return;
      }
      const currentJob = findCurrentJob(job);
      if (!currentJob) return;
      const state = reactive(new TaskState()) as TaskState;
      state.initialize(task.chapters, task.metadataUnit);
      taskStates.value.set(job.task, state);
      currentJob.progress = state.progress;
      updateJobCompletion(job, task, state);
    } catch (e) {
      if (!signal.aborted) reportInitializationError(job, e);
    } finally {
      if (initializingTasks.get(job.task) === controller) {
        initializingTasks.delete(job.task);
        // 当前任务加载完成后才推进队列，不在页面挂载时批量请求目录。
        runProcessLoop();
      }
    }
  }

  watch(
    () => jobs.value.map((job) => [job.task, job.createAt] as const),
    () => {
      if (disposed) return;
      const workspaceJobs = [...jobs.value];
      const activeTasks = new Set(workspaceJobs.map((job) => job.task));
      const knownTasks = new Set([
        ...taskStates.value.keys(),
        ...taskCache.keys(),
        ...taskLifecycles.keys(),
        ...initializingTasks.keys(),
        ...initializationErrors,
      ]);
      for (const task of knownTasks) {
        if (!activeTasks.has(task)) clearTaskRuntimeState(task);
      }

      for (const job of workspaceJobs) {
        let lifecycle = taskLifecycles.get(job.task);
        if (!lifecycle || lifecycle.createAt !== job.createAt) {
          clearTaskRuntimeState(job.task);
          lifecycle = new TaskLifecycle(job.createAt);
          taskLifecycles.set(job.task, lifecycle);
        }
      }
      runProcessLoop();
    },
    // 删除／替换同步终止旧版本，不能等下一次渲染才阻止保存。
    { immediate: true, flush: 'sync' },
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
    logs,
    clearLogs,
    jobs,
    clearTranslationCache,
    taskStates,
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
