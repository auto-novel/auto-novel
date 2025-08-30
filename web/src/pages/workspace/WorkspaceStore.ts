import { useSessionStorage } from '@vueuse/core';

import { Locator } from '@/data';

export interface WorkspaceJob {
  state: 'pending' | 'processing' | 'finished';
  name: string;
  descriptor: string;
  createAt: number;
  tasks: WorkspaceTask[];
}

export interface WorkspaceTask {
  state: 'pending' | 'processing' | 'success' | 'failed';
  name: string;
  descriptor: string;
  segs: WorkspaceSegment[];
}

export interface WorkspaceSegment {
  state: 'pending' | 'processing' | 'success' | 'fallback-success' | 'failed';
  src: string[];
  dst: string[];
  log: string[];
}

export const useWorkspaceStore = (id: 'sakura' | 'gpt') =>
  defineStore(`workspace/${id}`, () => {
    const jobs = useSessionStorage<Map<string, WorkspaceJob>>(
      `workspace/${id}`,
      new Map(),
    );

    const workspace = Locator.sakuraWorkspaceRepository();
    const workspaceRef = workspace.ref;

    watch(
      () => workspaceRef.value.jobs,
      async (tjobs) => {
        for (const tjob of tjobs) {
          if (!jobs.value.has(tjob.task)) {
            jobs.value.set(tjob.task, {
              state: 'pending',
              name: tjob.description,
              descriptor: tjob.task,
              createAt: tjob.createAt,
              tasks: [],
            });
          }
        }

        console.log(jobs.value);
      },
      { immediate: true },
    );

    const moveToTop = (descriptor: string) => {
      workspace.topJob(descriptor);
    };

    const moveToBottom = (descriptor: string) => {
      workspace.bottomJob(descriptor);
    };

    const deleteJob = async (task: string) => {
      const job = jobs.value.get(task);
      if (job === undefined) {
        return;
      } else if (job.state === 'processing') {
        throw Error('任务被翻译器占用');
      } else if (job.state === 'pending') {
        jobs.value.delete(task);
        workspace.deleteJob(task);
      } else if (job.state === 'finished') {
        jobs.value.delete(task);
      }
    };

    const deleteAllJobs = () => {
      workspaceRef.value.jobs.forEach((job) => {
        if (jobs.value.get(job.task)?.state === 'processing') {
          return;
        }
        workspace.deleteJob(job.task);
      });
    };

    const cleanCache = () =>
      Locator.cachedSegRepository().then((repo) =>
        repo.clear(`${id}-seg-cache`),
      );

    return {
      jobs,
      workspace: workspaceRef,
      moveToTop,
      moveToBottom,
      deleteJob,
      deleteAllJobs,
      cleanCache,
    };
  })();
