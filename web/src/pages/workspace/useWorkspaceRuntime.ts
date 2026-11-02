import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { Toast } from '@novelia/web-kit';
import { createTranslator, TranslationPipeline } from '@auto-novel/translator';
import type { TranslationWork } from '@auto-novel/translator';

import { useWorkspaceStore } from '@/stores';
import { TaskExecutor } from '@/domain/translator/TaskExecutor';
import { toTranslatorConfig } from '@/model/Translator';
import { IndexedDbSegmentCache } from '@/domain/translator/IndexedDbSegmentCache';
import { createTranslationTask } from '@/domain/translator/TranslationTask/createTranslationTask';
import type { TranslationTask } from '@/domain/translator/TranslationTask/types';
import { TaskState } from '@/domain/translator/TaskState';
import type { ChapterStatus } from '@/domain/translator/TaskState';
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

  /** 每类输入的队列水位跟随已注册翻译器总并发，预留一倍缓冲，独立背压。 */
  const pipeline = new TranslationPipeline({
    segmentLength: isSakura ? 500 : undefined,
    cache: new IndexedDbSegmentCache(segCacheName),
  });

  // ========== 任务状态管理 ==========

  const taskStates = ref(new Map<string, TaskState>());
  const taskCache = new Map<string, TranslationTask>();
  const taskVersions = ref(new Map<string, number>());
  /** 同一版本只初始化一次；跨标签页替换对象不能重建执行状态。 */
  const initializingTasks = new Map<string, { createAt: number }>();

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

  let trustedInputsController = new AbortController();

  let processLoopAbortController: AbortController | null = null;
  let disposed = false;

  onUnmounted(() => {
    disposed = true;
    initializingTasks.clear();
    abortMetadataTasks();
    abortPreparationTasks();
    processLoopAbortController?.abort();
    pipeline.dispose();
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

  /** 只枚举，不修改状态；取任务和判断是否还有任务共用同一筛选。 */
  function* schedulableChapters() {
    for (const job of jobs.value) {
      if (job.finishAt) continue;
      const task = taskCache.get(job.task);
      if (!task || task.needsPreparation || !canRunTask(task)) continue;
      const state = taskStates.value.get(job.task);
      if (!state) continue;
      for (const chapter of state.chapters) {
        if (chapter.status === 'pending') yield { job, chapter, state };
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
      !canRunTask(task) ||
      !task.prepareExecution ||
      preparationTasks.has(job.task)
    )
      return;
    const preparation = { controller: new AbortController(), settled: false };
    preparationTasks.set(job.task, preparation);
    const signal = preparation.controller.signal;
    const canPrepare = () =>
      !signal.aborted &&
      preparationTasks.get(job.task) === preparation &&
      taskCache.get(job.task) === task &&
      taskStates.value.get(job.task) === state &&
      !!findCurrentJob(job);
    task
      .prepareExecution({
        signal,
        canCommit: canPrepare,
        onLog: (message) => logTask(job.task, message),
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
        if (!signal.aborted) {
          logTask(job.task, `任务准备失败：${error}`, true);
          console.warn(`[${job.task}] 任务准备失败`, error);
        }
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
    if (
      !canRunTask(task) ||
      !isSakura ||
      !task.needsMetadata ||
      !task.translateMetadata
    )
      return;
    if (metadataTasks.has(job.task)) return;
    const metadata: MetadataState = {
      task,
      createAt: job.createAt,
      controller: new AbortController(),
      settled: false,
    };
    metadataTasks.set(job.task, metadata);
    const signal = metadata.controller.signal;
    const canCommitMetadata = () =>
      !signal.aborted &&
      metadataTasks.get(job.task) === metadata &&
      taskCache.get(job.task) === metadata.task &&
      jobs.value.some(
        (it) => it.task === job.task && it.createAt === metadata.createAt,
      );

    // 简介可能含换行，按行翻译后再按原行数拼回
    const translateTexts = async (texts: string[]) => {
      signal.throwIfAborted();
      const lineCounts = texts.map((text) => text.split('\n').length);
      const { lines, failed } = await pipeline.translate(
        {
          trustedOnly: true,
          lines: texts.flatMap((text) => text.split('\n')),
          glossary: task.glossary,
        },
        signal,
      );
      signal.throwIfAborted();
      // 分段失败时 pipeline 会回退为原文，不能把原文当译文上传
      if (failed.length > 0) throw new Error('分段翻译失败');
      if (
        lines.length !== lineCounts.reduce((total, count) => total + count, 0)
      ) {
        throw new Error('元数据译文行数不匹配');
      }
      return lineCounts.map((count) => lines.splice(0, count).join('\n'));
    };
    task
      .translateMetadata(translateTexts, signal, canCommitMetadata)
      .then(() => {
        if (!signal.aborted && metadataTasks.get(job.task) === metadata) {
          logTask(job.task, '元数据翻译完成');
        }
      })
      .catch((e) => {
        if (!signal.aborted) {
          logTask(job.task, `元数据翻译失败：${e}`, true);
          console.warn(`[${job.task}] 元数据翻译失败`, e);
        }
      })
      .finally(() => {
        if (metadataTasks.get(job.task) !== metadata) return;
        metadata.settled = true;
        updateJobCompletion(job, task, state);
      });
  }

  function runProcessLoop(): void {
    if (disposed || !hasRunningWorker()) return;

    for (const job of jobs.value) {
      if (job.finishAt) continue;
      const task = taskCache.get(job.task);
      const state = taskStates.value.get(job.task);
      if (task?.initialized && state?.initialized && canRunTask(task)) {
        if (task.needsPreparation) {
          prepareTaskOnce(job, task, state);
          continue;
        }
        translateMetadataOnce(job, task, state);
      }
    }

    // 停止后也必须等旧 run 退出，防止重新启动时重复拉取或覆盖章节状态。
    if (processLoopAbortController) return;
    if (schedulableChapters().next().done) return;
    const controller = new AbortController();
    processLoopAbortController = controller;
    const signal = controller.signal;
    // 每轮只转发一次取消；可信翻译器恢复时可在本轮内创建新的可信任务组。
    signal.addEventListener('abort', () => trustedInputsController.abort(), {
      once: true,
    });

    /** 取下一个可翻译章节；没有可交给当前翻译器的章节时返回 undefined。 */
    const nextWork = async (): Promise<
      | {
          work: TranslationWork;
          signal: AbortSignal;
        }
      | undefined
    > => {
      // 跳过缺少可信翻译器的远程任务，仍可继续处理本地任务。
      while (!signal.aborted && hasRunningWorker()) {
        const item = schedulableChapters().next().value;
        if (!item) return undefined;

        const { job, chapter, state } = item;
        const { chapterId } = chapter;
        chapter.status = 'translating';
        const task = await getOrCreateTask(job.task);
        const isCurrentTask = () =>
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
        const inputSignal =
          task.type === 'local' ? signal : trustedInputsController.signal;
        const executor = new TaskExecutor(
          task,
          () => !inputSignal.aborted && isCurrentTask(),
        );
        const segmentTracker = state.getChapterState(chapterId);
        if (!segmentTracker) continue;
        const work = await executor.prepareChapter(
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
        // 推模型：投递一个章节再取下一个，队列满时 submit 自己等待。
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
          appendLog('工作区', `章节翻译流水线失败：${error}`, 'warn');
          console.warn('章节翻译流水线失败', error);
        }
      })
      .finally(() => {
        if (processLoopAbortController !== controller) return;
        processLoopAbortController = null;
        // 本轮没有更多可做的章节，但任务可能新增或重试章节。
        if (!schedulableChapters().next().done) {
          runProcessLoop();
        }
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
      abortMetadataTasks();
      abortPreparationTasks();
    }

    if ([...workerStates.value.values()].every((s) => !s.running)) {
      abortMetadataTasks();
      abortPreparationTasks();
      processLoopAbortController?.abort();
      pipeline.dispose();
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
            logTask(job.task, `任务初始化失败：${e}`, true);
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
    logs,
    clearLogs,
    jobs,
    segCacheName,
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
