import type {
  GptWorker,
  GptPipelineWorker,
  SakuraWorker,
  TranslateJobRecord,
} from '@/model/Translator';
import { TranslateJob } from '@/model/Translator';
import { lazy, useLocalStorage } from '@/util';

import { LSKey } from './key';
import { addWorkspaceJob } from './workspaceJob';

interface Workspace<T> {
  workers: T[];
  jobs: TranslateJob[];
  // 为了兼容性，仍使用 uncompletedJobs
  uncompletedJobs: TranslateJobRecord[];
}

const createWorkspaceStore = <W extends GptWorker | SakuraWorker>(
  id: string,
  workers: W[],
  migrate?: (ref: Ref<Workspace<W>>) => void,
) => {
  const ref = useLocalStorage<Workspace<W>>(id, {
    workers,
    jobs: [],
    uncompletedJobs: [],
  });

  if (migrate) {
    migrate(ref);
  }

  const addWorker = (worker: W) => {
    ref.value.workers.push(worker);
  };
  const deleteWorker = (id: string) => {
    ref.value.workers = ref.value.workers.filter((w) => w.id !== id);
  };

  const addJob = (job: TranslateJob) => {
    return addWorkspaceJob(ref.value.jobs, job);
  };
  const deleteJob = (task: string) => {
    ref.value.jobs = ref.value.jobs.filter((j) => j.task !== task);
  };
  const topJob = (job: TranslateJob) => {
    ref.value.jobs.sort((a, b) => {
      return a.task == job.task ? -1 : b.task == job.task ? 1 : 0;
    });
  };
  const bottomJob = (job: TranslateJob) => {
    ref.value.jobs.sort((a, b) => {
      return a.task == job.task ? 1 : b.task == job.task ? -1 : 0;
    });
  };

  const addJobRecord = (job: TranslateJobRecord) => {
    deleteJobRecord(job);
    ref.value.uncompletedJobs.push(job);
  };
  const deleteJobRecord = (job: TranslateJobRecord) => {
    ref.value.uncompletedJobs = ref.value.uncompletedJobs.filter(
      (j) => j.task !== job.task,
    );
  };
  const retryJobRecord = (job: TranslateJobRecord) => {
    addJob({
      task: job.task,
      description: job.description,
      createAt: Date.now(),
    });
    deleteJobRecord(job);
  };
  const retryAllJobRecords = () => {
    const newArray: TranslateJobRecord[] = [];
    for (const job of ref.value.uncompletedJobs) {
      if (TranslateJob.isFinished(job)) {
        newArray.push(job);
      } else {
        addJob({
          task: job.task,
          description: job.description,
          createAt: Date.now(),
        });
      }
    }
    ref.value.uncompletedJobs = newArray;
  };
  const deleteAllJobRecords = () => {
    ref.value.uncompletedJobs = [];
  };

  return {
    ref,
    //
    addWorker,
    deleteWorker,
    //
    addJob,
    deleteJob,
    topJob,
    bottomJob,
    //
    addJobRecord,
    deleteJobRecord,
    retryJobRecord,
    retryAllJobRecords,
    deleteAllJobRecords,
  };
};

const createGptWorkspaceStore = () =>
  createWorkspaceStore<GptWorker>(LSKey.WorkspaceGpt, [], (workspace) => {
    // 2026-5-9
    workspace.value.workers = workspace.value.workers.filter((it) => {
      return !('type' in it && it.type === 'web');
    });
  });

const createGptPipelineWorkspaceStore = () =>
  createWorkspaceStore<GptPipelineWorker>(LSKey.WorkspaceGptPipeline, []);

const createSakuraWorkspaceStore = () =>
  createWorkspaceStore<SakuraWorker>(
    LSKey.WorkspaceSakura,
    [
      { id: '共享', endpoint: 'https://sakura-share.one' },
      { id: '本机', endpoint: 'http://127.0.0.1:8080' },
      { id: 'AutoDL', endpoint: 'http://127.0.0.1:6006' },
    ],
    (workspace) => {
      // 2024-5-14
      workspace.value.workers.forEach((it: SakuraWorker) => {
        if ('testContext' in it) {
          it.testContext = undefined;
        }
        if ('testSegLength' in it && typeof it.testSegLength === 'number') {
          it.segLength = it.testSegLength;
          it.testSegLength = undefined;
        }
      });

      // 2025-2-21
      if (
        workspace.value.workers.find(
          (it) => it.endpoint === 'https://sakura-share.one',
        ) === undefined
      ) {
        workspace.value.workers.unshift({
          id: '共享',
          endpoint: 'https://sakura-share.one',
        });
      }
    },
  );

export const useGptWorkspaceStore = lazy(createGptWorkspaceStore);
export const useGptPipelineWorkspaceStore = lazy(
  createGptPipelineWorkspaceStore,
);
export const useSakuraWorkspaceStore = lazy(createSakuraWorkspaceStore);

export function useWorkspaceStore(type: 'gpt' | 'sakura' | 'gpt-pipeline') {
  if (type === 'gpt') {
    return useGptWorkspaceStore();
  } else if (type === 'gpt-pipeline') {
    return useGptPipelineWorkspaceStore();
  } else if (type === 'sakura') {
    return useSakuraWorkspaceStore();
  } else {
    return type satisfies never;
  }
}
