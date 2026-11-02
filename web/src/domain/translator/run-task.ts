import { TranslationPipeline } from '@auto-novel/translator';
import {
  createSingleTaskTranslator,
  type SingleTaskTranslatorConfig,
} from './translate-lines';

export type { SingleTaskTranslatorConfig } from './translate-lines';

import type {
  TranslateTaskDesc,
  TranslateTaskParams,
} from '@/model/Translator';
import { WorkPreparer } from './prepare-work';
import { IndexedDbSegmentCache } from './segment-cache';
import { TaskState } from './task-state';
import { createTranslationTask } from './tasks/create-task';
import type { ChapterSaveResult } from './tasks/task';

interface TaskCallbacks {
  onProgressUpdated: (progress: {
    finished: number;
    error: number;
    total: number;
  }) => void;
  onChapterSaved: (counts: ChapterSaveResult) => void;
  log: (message: string, detail?: readonly string[]) => void;
}

/** 独立入口一次执行一个任务，逐单元结算，不引入工作区调度与持久状态。 */
export async function runTranslationTask(
  desc: TranslateTaskDesc,
  params: TranslateTaskParams,
  config: SingleTaskTranslatorConfig,
  callbacks: TaskCallbacks,
  signal = new AbortController().signal,
): Promise<'complete' | 'uncomplete' | 'abort'> {
  let pipeline: TranslationPipeline | undefined;
  try {
    signal.throwIfAborted();
    const segmentLength =
      config.id === 'sakura' ? config.segLength ?? 500 : 3500;
    const translator = await createSingleTaskTranslator(config, callbacks.log);
    signal.throwIfAborted();
    if (desc.type !== 'local') {
      if (
        !translator.trusted ||
        (config.id === 'sakura' && segmentLength !== 500)
      ) {
        callbacks.log(
          config.id === 'sakura' && segmentLength !== 500
            ? '分段长度不是500'
            : translator.untrustedReason ?? '翻译器不可信，无法上传译文',
        );
        return 'uncomplete';
      }
    }

    pipeline = new TranslationPipeline({
      segmentLength,
      cache:
        config.id === 'sakura'
          ? new IndexedDbSegmentCache('sakura-seg-cache')
          : undefined,
    });
    pipeline.registerTranslator(translator);
    const task = createTranslationTask(desc, config.id, params);
    callbacks.log('获取翻译任务');
    await task.initialize({ signal, onLog: callbacks.log });
    signal.throwIfAborted();
    const state = new TaskState();
    state.initialize(task.chapters, task.metadataUnit);
    callbacks.onProgressUpdated(state.progress);
    const preparer = new WorkPreparer(task);

    for (const unit of state.units) {
      signal.throwIfAborted();
      if (unit.status !== 'pending') continue;
      const work = await preparer.prepareUnit(
        unit,
        {
          onUnitStatus: (chapterId, status) => {
            state.updateStatus(chapterId, status);
            callbacks.onProgressUpdated(state.progress);
          },
          onLog: callbacks.log,
          onChapterSaved: callbacks.onChapterSaved,
        },
        signal,
      );
      if (work) {
        await pipeline.submit(work, signal);
        await pipeline.drain();
      }
    }
    signal.throwIfAborted();
    return state.units.every((unit) => unit.status === 'done')
      ? 'complete'
      : 'uncomplete';
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      callbacks.log('中止翻译任务');
      return 'abort';
    }
    callbacks.log(`发生错误，结束翻译任务：${error}`);
    return 'uncomplete';
  } finally {
    pipeline?.dispose();
    await pipeline?.drain();
  }
}
