import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';

import { WebNovelApi, WenkuNovelApi } from '@/api';
import {
  Translator,
  createLengthSegmentor,
  createSegIndexedDbCache,
} from '@/domain/translate';
import type {
  TranslatorConfig,
  SegmentTranslator,
  SegmentCache,
} from '@/domain/translate';
import type { Glossary } from '@/model/Glossary';
import type { ChapterTranslation } from '@/model/LocalVolume';
import {
  TranslateTaskDescriptor,
  type TranslateTaskDesc,
  type TranslateTaskParams,
} from '@/model/Translator';
import { useLocalVolumeStore, useWorkspaceStore } from '@/stores';
import { RegexUtil } from '@/util';

// ?????? Data Models ??????

export type SegmentState = 'pending' | 'processing' | 'success' | 'failed';

export interface WorkspaceSegment {
  state: SegmentState;
  src: string[];
  dst: string[];
  log: string[];
  retryCount: number;
}

export type TaskState =
  | 'pending'
  | 'loading'
  | 'processing'
  | 'success'
  | 'failed';

// Upload context discriminated union
type LocalUploadCtx = {
  type: 'local';
  volumeId: string;
  chapterId: string;
  glossaryId: string;
  glossary: Glossary;
};

type WebUploadCtx = {
  type: 'web';
  providerId: string;
  novelId: string;
  translatorId: string;
  chapterId: string;
  glossaryId: string;
  syncFromProvider: boolean;
};

type WenkuUploadCtx = {
  type: 'wenku';
  novelId: string;
  volumeId: string;
  translatorId: string;
  chapterId: string;
  glossaryId: string;
};

type UploadContext = LocalUploadCtx | WebUploadCtx | WenkuUploadCtx;

export interface WorkspaceTask {
  state: TaskState;
  chapterId: string;
  label: string;
  segs: WorkspaceSegment[];
  glossary: Glossary;
  oldGlossary?: Glossary;
  paragraphsJp: string[];
  filteredParagraphsJp: string[];
  oldParagraphsZh?: string[];
  force: boolean;
  uploadContext: UploadContext;
}

export type JobState = 'pending' | 'loading' | 'processing' | 'finished';

export interface WorkspaceJob {
  state: JobState;
  name: string;
  descriptor: string;
  createAt: number;
  tasks: WorkspaceTask[];
  taskDesc: TranslateTaskDesc;
  taskParams: TranslateTaskParams;
  error?: string;
}

export interface SegRequestResult {
  jobDescriptor: string;
  taskIndex: number;
  segIndex: number;
  seg: WorkspaceSegment;
  glossary: Glossary;
  prevSegs: string[][];
}

// ?????? Empty line filter logic (mirrors Translator.ts) ??????

function filterEmptyLines(textJp: string[]): {
  filtered: string[];
  indices: number[];
} {
  const filtered: string[] = [];
  const indices: number[] = [];
  for (let i = 0; i < textJp.length; i++) {
    const line = textJp[i].replace(/\r?\n|\r/g, '');
    if (!(line.trim() === '' || line.startsWith('<???>'))) {
      filtered.push(line);
      indices.push(i);
    }
  }
  return { filtered, indices };
}

function recoverEmptyLines(
  textJp: string[],
  translatedFiltered: string[],
): string[] {
  const result: string[] = [];
  let filteredIdx = 0;
  for (const lineJp of textJp) {
    const realLine = lineJp.replace(/\r?\n|\r/g, '');
    if (realLine.trim() === '' || realLine.startsWith('<???>')) {
      result.push(lineJp);
    } else {
      result.push(translatedFiltered[filteredIdx++]);
    }
  }
  return result;
}

// ?????? Store Factory ??????

export function useWorkspaceXStore(id: 'sakura' | 'gpt') {
  return defineStore(`workspaceX-${id}`, () => {
    const legacyStore = useWorkspaceStore(id);
    const jobs = ref<WorkspaceJob[]>([]);

    // ?????? populateJob ??????
    async function populateJob(job: WorkspaceJob) {
      job.state = 'loading';
      try {
        const { desc, params } = {
          desc: job.taskDesc,
          params: job.taskParams,
        };

        if (desc.type === 'local') {
          await populateLocalJob(job, desc.volumeId, params);
        } else if (desc.type === 'web') {
          await populateWebJob(job, desc.providerId, desc.novelId, params);
        } else if (desc.type === 'wenku') {
          await populateWenkuJob(job, desc.novelId, desc.volumeId, params);
        }

        if (job.tasks.length === 0) {
          // No chapters to translate — just remove from queue silently.
          // Don't call moveToFinished to avoid overwriting existing job records
          // (e.g. on page refresh when all chapters are already translated).
          const idx = jobs.value.indexOf(job);
          if (idx >= 0) jobs.value.splice(idx, 1);
          legacyStore.deleteJob(job.descriptor);
          return;
        }

        // Preload segments for local jobs only (IndexedDB reads are fast).
        // Web/wenku jobs load lazily to avoid flooding the server with API calls.
        if (desc.type === 'local') {
          await Promise.all(
            job.tasks.map((_, ti) => loadTaskSegments(job, ti)),
          );
        }

        job.state = 'processing';
      } catch (e) {
        console.error('Failed to populate job:', e);
        job.error = e instanceof Error ? e.message : String(e);
        job.state = 'finished';
        moveToFinished(job);
      }
    }

    function moveToFinished(job: WorkspaceJob) {
      const idx = jobs.value.indexOf(job);
      if (idx >= 0) {
        jobs.value.splice(idx, 1);
      }

      // Add to job records via legacy store
      const stats = getJobStats(job);
      legacyStore.addJobRecord({
        task: job.descriptor,
        description: job.name,
        createAt: job.createAt,
        finishAt: Date.now(),
        progress: {
          finished: stats.successTasks,
          error: stats.failedTasks,
          total: stats.totalTasks,
        },
      });

      // Remove from legacy jobs queue
      legacyStore.deleteJob(job.descriptor);
    }

    async function populateLocalJob(
      job: WorkspaceJob,
      volumeId: string,
      params: TranslateTaskParams,
    ) {
      const localVolumeStore = await useLocalVolumeStore();
      const metadata = await localVolumeStore.getVolume(volumeId);
      if (!metadata) throw new Error('找不到本地卷');

      const { level, startIndex, endIndex } = params;
      const forceSeg = level === 'all';

      let chapters: string[];
      if (level === 'all') {
        chapters = metadata.toc
          .slice(startIndex, endIndex)
          .map((it) => it.chapterId);
      } else {
        const untranslated = metadata.toc
          .slice(startIndex, endIndex)
          .filter((it) => it[id] === undefined)
          .map((it) => it.chapterId);
        if (level === 'normal') {
          chapters = untranslated;
        } else {
          const expired = metadata.toc
            .slice(startIndex, endIndex)
            .filter(
              (it) => it[id] !== undefined && it[id] !== metadata.glossaryId,
            )
            .map((it) => it.chapterId);
          chapters = untranslated.concat(expired);
        }
      }
      chapters.sort((a, b) => a.localeCompare(b));

      for (const chapterId of chapters) {
        job.tasks.push({
          state: 'pending',
          chapterId,
          label: `${volumeId}/${chapterId}`,
          segs: [],
          glossary: metadata.glossary,
          paragraphsJp: [],
          filteredParagraphsJp: [],
          force: forceSeg,
          uploadContext: {
            type: 'local',
            volumeId,
            chapterId,
            glossaryId: metadata.glossaryId,
            glossary: metadata.glossary,
          },
        });
      }
    }

    async function populateWebJob(
      job: WorkspaceJob,
      providerId: string,
      novelId: string,
      params: TranslateTaskParams,
    ) {
      const { level, startIndex, endIndex, forceMetadata } = params;
      const forceSeg = level === 'all';
      const syncFromProvider = level === 'sync';

      const api = WebNovelApi.createTranslationApi(
        providerId,
        novelId,
        id,
        syncFromProvider,
      );
      const task = await api.getTranslateTask();

      // Metadata translation as a special first task is skipped in concurrent mode
      // (too complex for segment-level parallelism, handled separately if needed)

      const chapters = task.toc
        .filter(({ chapterId }) => chapterId !== undefined)
        .map(({ chapterId, glossaryUuid }, index) => ({
          index,
          chapterId: chapterId!,
          glossaryUuid,
        }))
        .slice(startIndex, endIndex)
        .filter(({ glossaryUuid }) => {
          if (level === 'normal') return glossaryUuid === undefined;
          if (level === 'expire')
            return (
              glossaryUuid === undefined || glossaryUuid !== task.glossaryUuid
            );
          return true;
        });

      for (const { chapterId } of chapters) {
        job.tasks.push({
          state: 'pending',
          chapterId,
          label: `${providerId}/${novelId}/${chapterId}`,
          segs: [],
          glossary: task.glossary,
          paragraphsJp: [],
          filteredParagraphsJp: [],
          force: forceSeg,
          uploadContext: {
            type: 'web',
            providerId,
            novelId,
            translatorId: id,
            chapterId,
            glossaryId: task.glossaryUuid,
            syncFromProvider,
          },
        });
      }
    }

    async function populateWenkuJob(
      job: WorkspaceJob,
      novelId: string,
      volumeId: string,
      params: TranslateTaskParams,
    ) {
      const { level } = params;
      const forceSeg = level === 'all';

      const api = WenkuNovelApi.createTranslationApi(novelId, volumeId, id);
      const task = await api.getTranslateTask();

      const chapters = task.toc
        .filter(({ chapterId }) => chapterId !== undefined)
        .map(({ chapterId, glossaryId }, index) => ({
          index,
          chapterId: chapterId!,
          glossaryId,
        }))
        .filter(({ glossaryId }) => {
          if (level === 'normal') return glossaryId === undefined;
          if (level === 'expire')
            return glossaryId === undefined || glossaryId !== task.glossaryId;
          return true;
        });

      for (const { chapterId } of chapters) {
        job.tasks.push({
          state: 'pending',
          chapterId,
          label: `wenku/${novelId}/${chapterId}`,
          segs: [],
          glossary: {},
          paragraphsJp: [],
          filteredParagraphsJp: [],
          force: forceSeg,
          uploadContext: {
            type: 'wenku',
            novelId,
            volumeId,
            translatorId: id,
            chapterId,
            glossaryId: task.glossaryId,
          },
        });
      }
    }

    // ?????? loadTaskSegments ??????
    async function loadTaskSegments(job: WorkspaceJob, taskIndex: number) {
      const task = job.tasks[taskIndex];
      if (task.segs.length > 0) return; // already loaded

      task.state = 'loading';

      const desc = job.taskDesc;
      const segLength = id === 'sakura' ? 500 : 1500;
      const segMaxLine = id === 'sakura' ? undefined : 30;
      const segmentor = createLengthSegmentor(segLength, segMaxLine);

      try {
        if (desc.type === 'local') {
          await loadLocalTaskSegments(task, desc.volumeId, segmentor);
        } else if (desc.type === 'web') {
          await loadWebTaskSegments(task, desc, segmentor);
        } else if (desc.type === 'wenku') {
          await loadWenkuTaskSegments(task, desc, segmentor);
        }

        // If no segments were produced (e.g. nav.xhtml, empty chapters),
        // still upload so the chapter is marked translated consistently.
        if (task.segs.length === 0) {
          console.log(
            `[loadTaskSegments] task ${task.chapterId}: 0 segments, uploading empty translation`,
          );
          try {
            await uploadTaskResult(job, task);
            task.state = 'success';
          } catch (e) {
            console.error('Upload failed for empty-segment task:', e);
            task.state = 'failed';
          }
        } else {
          task.state = 'processing';
        }
      } catch (e) {
        console.error('Failed to load task segments:', e);
        task.state = 'failed';
      }
    }

    async function loadLocalTaskSegments(
      task: WorkspaceTask,
      volumeId: string,
      segmentor: ReturnType<typeof createLengthSegmentor>,
    ) {
      const localVolumeStore = await useLocalVolumeStore();
      const chapter = await localVolumeStore.getChapter(
        volumeId,
        task.chapterId,
      );
      if (!chapter) throw new Error('找不到本地章节');

      console.log(
        '[loadLocal] chapterId:',
        task.chapterId,
        'paragraphs:',
        chapter.paragraphs?.length,
        'keys:',
        Object.keys(chapter),
      );

      task.paragraphsJp = chapter.paragraphs;
      const { filtered } = filterEmptyLines(chapter.paragraphs);
      task.filteredParagraphsJp = filtered;

      // Get old translation
      const oldTranslation = chapter[id];
      if (oldTranslation) {
        task.oldGlossary = oldTranslation.glossary;
        const { filtered: oldFiltered } = filterEmptyLines(
          oldTranslation.paragraphs,
        );
        task.oldParagraphsZh = oldFiltered;
      }

      buildSegments(task, segmentor);
    }

    async function loadWebTaskSegments(
      task: WorkspaceTask,
      desc: { providerId: string; novelId: string },
      segmentor: ReturnType<typeof createLengthSegmentor>,
    ) {
      const ctx = task.uploadContext as WebUploadCtx;
      const api = WebNovelApi.createTranslationApi(
        desc.providerId,
        desc.novelId,
        id,
        ctx.syncFromProvider,
      );
      const cTask = await api.getChapterTranslateTask(task.chapterId);

      task.paragraphsJp = cTask.paragraphJp;
      task.glossary = cTask.glossary;
      task.oldGlossary = cTask.oldGlossary;

      const { filtered } = filterEmptyLines(cTask.paragraphJp);
      task.filteredParagraphsJp = filtered;

      if (cTask.oldParagraphZh) {
        const { filtered: oldFiltered } = filterEmptyLines(
          cTask.oldParagraphZh,
        );
        task.oldParagraphsZh = oldFiltered;
      }

      ctx.glossaryId = cTask.glossaryId;
      buildSegments(task, segmentor);
    }

    async function loadWenkuTaskSegments(
      task: WorkspaceTask,
      desc: { novelId: string; volumeId: string },
      segmentor: ReturnType<typeof createLengthSegmentor>,
    ) {
      const ctx = task.uploadContext as WenkuUploadCtx;
      const api = WenkuNovelApi.createTranslationApi(
        desc.novelId,
        desc.volumeId,
        id,
      );
      const cTask = await api.getChapterTranslateTask(task.chapterId);

      task.paragraphsJp = cTask.paragraphJp;
      task.glossary = cTask.glossary;
      task.oldGlossary = cTask.oldGlossary;

      const { filtered } = filterEmptyLines(cTask.paragraphJp);
      task.filteredParagraphsJp = filtered;

      if (cTask.oldParagraphZh) {
        const { filtered: oldFiltered } = filterEmptyLines(
          cTask.oldParagraphZh,
        );
        task.oldParagraphsZh = oldFiltered;
      }

      ctx.glossaryId = cTask.glossaryId;
      buildSegments(task, segmentor);
    }

    function buildSegments(
      task: WorkspaceTask,
      segmentor: ReturnType<typeof createLengthSegmentor>,
    ) {
      console.log(
        '[buildSegments] filteredJp:',
        task.filteredParagraphsJp.length,
        'oldZh:',
        task.oldParagraphsZh?.length,
      );
      const segs = segmentor(task.filteredParagraphsJp, task.oldParagraphsZh);
      console.log(
        '[buildSegments] segmentor produced:',
        segs.length,
        'segments',
      );

      task.segs = segs.map(([segJp]) => ({
        state: 'pending' as SegmentState,
        src: segJp,
        dst: [],
        log: [],
        retryCount: 0,
      }));
      console.log(
        '[buildSegments] task.segs.length after assign:',
        task.segs.length,
      );
    }

    // ?????? Job claiming ??????
    const claimedJobs = new Map<string, string>(); // jobDescriptor ??workerId

    function releaseWorkerClaims(workerId: string) {
      for (const [desc, wid] of claimedJobs) {
        if (wid === workerId) claimedJobs.delete(desc);
      }
    }

    // ?????? requestSeg ??????
    async function requestSeg(
      workerId: string,
    ): Promise<SegRequestResult | undefined> {
      if (jobs.value.length === 0) return undefined;

      // Find job already claimed by this worker
      let targetJob: WorkspaceJob | undefined;
      for (const job of jobs.value) {
        if (job.state !== 'processing') continue;
        if (claimedJobs.get(job.descriptor) === workerId) {
          targetJob = job;
          break;
        }
      }

      // If no claimed job, claim next unclaimed processing job
      if (!targetJob) {
        for (const job of jobs.value) {
          if (job.state !== 'processing') continue;
          if (!claimedJobs.has(job.descriptor)) {
            claimedJobs.set(job.descriptor, workerId);
            targetJob = job;
            break;
          }
        }
      }

      if (!targetJob) return undefined;

      const job = targetJob;
      let hasPendingWork = false;

      for (let ti = 0; ti < job.tasks.length; ti++) {
        const task = job.tasks[ti];

        if (task.state === 'success' || task.state === 'failed') continue;

        // Lazy load segments
        if (task.state === 'pending') {
          await loadTaskSegments(job, ti);
        }

        // After loading, task might be 'success' (skipped) or 'failed' or 'loading'
        if (task.state !== 'processing') {
          if (task.state === 'loading') hasPendingWork = true;
          continue;
        }

        // One worker per chapter: skip task if it already has a segment being translated
        const hasProcessingSeg = task.segs.some(
          (s) => s.state === 'processing',
        );
        if (hasProcessingSeg) {
          hasPendingWork = true;
          continue;
        }

        for (let si = 0; si < task.segs.length; si++) {
          const seg = task.segs[si];
          if (seg.state === 'pending') {
            seg.state = 'processing';

            // Collect previous translated segments for context
            const prevSegs: string[][] = [];
            for (let pi = 0; pi < si; pi++) {
              const prev = task.segs[pi];
              if (prev.state === 'success') {
                prevSegs.push(prev.dst);
              }
            }

            return {
              jobDescriptor: job.descriptor,
              taskIndex: ti,
              segIndex: si,
              seg,
              glossary: { ...toRaw(task.glossary) },
              prevSegs: prevSegs.map((p) => [...toRaw(p)]),
            };
          }
          if (seg.state === 'processing') hasPendingWork = true;
        }
      }

      // All tasks checked ??if no pending work left, job is done
      if (!hasPendingWork) {
        claimedJobs.delete(job.descriptor);
        checkJobCompletion(job);
      }
      return undefined;
    }

    // ?????? postSeg ??????
    async function postSeg(
      jobDescriptor: string,
      taskIndex: number,
      segIndex: number,
      result: {
        state: 'success' | 'failed';
        dst: string[];
        log: string[];
      },
    ) {
      const job = jobs.value.find((j) => j.descriptor === jobDescriptor);
      if (!job) return;

      const task = job.tasks[taskIndex];
      if (!task) return;

      const seg = task.segs[segIndex];
      if (!seg) return;

      seg.state = result.state;
      seg.dst = result.dst;
      seg.log.push(...result.log);

      // Check if all segments in this task are done
      const allDone = task.segs.every(
        (s) => s.state === 'success' || s.state === 'failed',
      );

      if (allDone) {
        const anyFailed = task.segs.some((s) => s.state === 'failed');
        if (anyFailed) {
          task.state = 'failed';
        } else {
          // Upload result
          try {
            await uploadTaskResult(job, task);
            task.state = 'success';
          } catch (e) {
            console.error('Upload failed:', e);
            task.state = 'failed';
          }
        }

        // Check if all tasks in this job are done
        checkJobCompletion(job);
      }
    }

    function checkJobCompletion(job: WorkspaceJob) {
      const allTasksDone = job.tasks.every(
        (t) => t.state === 'success' || t.state === 'failed',
      );
      if (allTasksDone) {
        job.state = 'finished';
        moveToFinished(job);
      }
    }

    // ?????? uploadTaskResult ??????
    async function uploadTaskResult(job: WorkspaceJob, task: WorkspaceTask) {
      // Reassemble translated text from segments (unwrap reactive proxies)
      const translatedFiltered = toRaw(task.segs).flatMap((s) => [
        ...toRaw(s.dst),
      ]);

      // Recover empty lines
      const fullTranslation = recoverEmptyLines(
        [...toRaw(task.paragraphsJp)],
        translatedFiltered,
      );

      const ctx = toRaw(task.uploadContext);

      if (ctx.type === 'local') {
        const localVolumeStore = await useLocalVolumeStore();
        await localVolumeStore.updateTranslation(
          ctx.volumeId,
          ctx.chapterId,
          id,
          {
            glossaryId: ctx.glossaryId,
            glossary: { ...toRaw(ctx.glossary) },
            paragraphs: fullTranslation,
          } as ChapterTranslation,
        );
      } else if (ctx.type === 'web') {
        const api = WebNovelApi.createTranslationApi(
          ctx.providerId,
          ctx.novelId,
          id as any,
          ctx.syncFromProvider,
        );
        await api.updateChapterTranslation(ctx.chapterId, {
          glossaryId: ctx.glossaryId,
          paragraphsZh: fullTranslation,
        });
      } else if (ctx.type === 'wenku') {
        const api = WenkuNovelApi.createTranslationApi(
          ctx.novelId,
          ctx.volumeId,
          id as any,
        );
        await api.updateChapterTranslation(ctx.chapterId, {
          glossaryId: ctx.glossaryId,
          paragraphsZh: fullTranslation,
        });
      }
    }

    // ?????? addJob ??????
    function addJob(descriptor: string, name: string) {
      // Check for duplicate
      if (jobs.value.some((j) => j.descriptor === descriptor)) {
        return false;
      }

      const { desc, params } = TranslateTaskDescriptor.parse(descriptor);

      const job: WorkspaceJob = {
        state: 'pending',
        name,
        descriptor,
        createAt: Date.now(),
        tasks: [],
        taskDesc: desc,
        taskParams: params,
      };

      jobs.value.push(job);
      // Use the reactive proxy from the array for proper reactivity
      const reactiveJob = jobs.value[jobs.value.length - 1];
      populateJob(reactiveJob);
      return true;
    }

    function deleteJob(descriptor: string) {
      claimedJobs.delete(descriptor);
      const idx = jobs.value.findIndex((j) => j.descriptor === descriptor);
      if (idx >= 0) {
        jobs.value.splice(idx, 1);
      }
    }

    function topJob(descriptor: string) {
      jobs.value.sort((a, b) =>
        a.descriptor === descriptor ? -1 : b.descriptor === descriptor ? 1 : 0,
      );
    }

    function bottomJob(descriptor: string) {
      jobs.value.sort((a, b) =>
        a.descriptor === descriptor ? 1 : b.descriptor === descriptor ? -1 : 0,
      );
    }

    // ?????? retryFailedSegments ??????
    function retryFailedSegments(jobDescriptor: string, taskIndex: number) {
      const job = jobs.value.find((j) => j.descriptor === jobDescriptor);
      if (!job) return;

      const task = job.tasks[taskIndex];
      if (!task) return;

      for (const seg of task.segs) {
        if (seg.state === 'failed') {
          seg.state = 'pending';
          seg.dst = [];
          seg.log = [];
          seg.retryCount = 0;
        }
      }
      task.state = 'processing';
    }

    // ?????? Stats ??????
    function getJobStats(job: WorkspaceJob) {
      let totalTasks = 0;
      let successTasks = 0;
      let failedTasks = 0;

      for (const task of job.tasks) {
        totalTasks++;
        if (task.state === 'success') successTasks++;
        else if (task.state === 'failed') failedTasks++;
      }

      return { totalTasks, successTasks, failedTasks };
    }

    return {
      jobs,
      addJob,
      deleteJob,
      topJob,
      bottomJob,
      requestSeg,
      postSeg,
      releaseWorkerClaims,
      retryFailedSegments,
      getJobStats,
    };
  })();
}
