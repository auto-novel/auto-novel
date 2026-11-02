import type {
  TranslateTaskDesc,
  TranslateTaskParams,
  TranslatorId,
} from '@/model/Translator';
import type { TranslationTask } from './task';
import { LocalTranslationTask } from './local-task';
import { WebTranslationTask } from './web-task';
import { WenkuTranslationTask } from './wenku-task';

export function createTranslationTask(
  desc: TranslateTaskDesc,
  translatorId: TranslatorId,
  params: TranslateTaskParams,
): TranslationTask {
  switch (desc.type) {
    case 'local':
      return new LocalTranslationTask(desc.volumeId, translatorId, params);
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
