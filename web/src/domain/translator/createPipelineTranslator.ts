import { createTranslator } from '@auto-novel/translator';
import type {
  Logger,
  Translator,
  TranslatorProbe,
} from '@auto-novel/translator';

import type { GptPipelineWorker, SakuraWorker } from '@/model/Translator';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';

/** 按工作区里的翻译器配置创建实例；Sakura 需要先探测模型。 */
export function createPipelineTranslator(
  translatorId: TranslatorId,
  worker: GptPipelineWorker | SakuraWorker,
  log?: Logger,
): Promise<Translator> {
  if (translatorId === 'sakura') {
    return createTranslator(
      {
        kind: 'sakura',
        endpoint: worker.endpoint,
        prevSegLength: (worker as SakuraWorker).prevSegLength,
      },
      log,
    );
  }
  const gpt = worker as GptPipelineWorker;
  return createTranslator(
    {
      kind: 'openai',
      endpoint: gpt.endpoint,
      key: gpt.key,
      model: gpt.model,
      profile: gpt.profile,
    },
    log,
  );
}

/** 是否允许向该翻译器发送内容；没有自检能力的实现默认允许。 */
export async function probeTranslator(
  translator: Translator,
): Promise<TranslatorProbe> {
  return (await translator.probe?.()) ?? { approved: true };
}
