import type { TranslateJob } from '@/model/Translator';

export const addWorkspaceJob = (jobs: TranslateJob[], job: TranslateJob) => {
  const conflictJobIndex = jobs.findIndex((it) => it.task === job.task);
  if (conflictJobIndex === -1) {
    jobs.push(job);
    return true;
  }

  const conflictJob = jobs[conflictJobIndex];
  if (conflictJob.finishAt === undefined) {
    return false;
  }

  jobs[conflictJobIndex] = {
    task: job.task,
    description: job.description,
    createAt: job.createAt,
  };
  return true;
};
