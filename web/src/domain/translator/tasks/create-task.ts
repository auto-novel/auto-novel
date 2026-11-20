import type { TranslatorId } from '@/model/Translator';
import {
  resolveTaskParams,
  type TranslateTaskDesc,
  type TranslateTaskOptions,
} from './task-descriptor';
import type { TranslationTask } from './task';
import { LocalTranslationTask, type LocalTaskOptions } from './local-task';
import { WebTranslationTask } from './web-task';
import { WenkuTranslationTask } from './wenku-task';

export function createTranslationTask(
  desc: TranslateTaskDesc,
  translatorId: TranslatorId,
  options: TranslateTaskOptions,
  localOptions?: LocalTaskOptions,
): TranslationTask {
  const params = resolveTaskParams(options);
  switch (desc.type) {
    case 'local':
      return new LocalTranslationTask(
        desc.volumeId,
        translatorId,
        params,
        localOptions,
      );
    case 'web':
      return new WebTranslationTask(
        desc.providerId,
        desc.novelId,
        translatorId,
        params,
      );
    case 'wenku':
      return new WenkuTranslationTask(
        desc.novelId,
        desc.volumeId,
        translatorId,
        params,
      );
  }
}
