import type {
  TranslateTaskDesc,
  TranslateTaskParams,
} from '@/model/Translator';
import type { TranslationTask } from './types';
import { LocalTranslationTask } from './LocalTranslationTask';
import { WebTranslationTask } from './WebTranslationTask';
import { WenkuTranslationTask } from './WenkuTranslationTask';

export function createTranslationTask(
  desc: TranslateTaskDesc,
  translatorId: 'gpt',
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
