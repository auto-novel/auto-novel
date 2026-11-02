import type {
  TranslateTaskCallback,
  TranslateTaskDesc,
  TranslateTaskParams,
} from '@/model/Translator';

import { translateLocal } from './TranslateLocal';
import { translateWeb } from './TranslateWeb';
import { translateWenku } from './TranslateWenku';
import type { TranslatorConfig } from './Translator';
import { Translator } from './Translator';

export const translate = async (
  taskDesc: TranslateTaskDesc,
  taskParams: TranslateTaskParams,
  taskCallback: TranslateTaskCallback,
  translatorConfig: TranslatorConfig,
  signal?: AbortSignal,
) => {
  let translator: Translator;
  try {
    translator = await Translator.create(
      translatorConfig,
      true,
      (message, detail) => taskCallback.log('　' + message, detail),
    );
  } catch (e: unknown) {
    taskCallback.log(`发生错误，无法创建翻译器：${e}`);
    return;
  }

  if (taskDesc.type === 'web' || taskDesc.type === 'wenku') {
    if (!translator.trusted) {
      taskCallback.log(
        translator.untrustedReason ?? '翻译器不可信，无法上传译文',
      );
      return;
    }
  }

  if (taskDesc.type === 'web') {
    return translateWeb(taskDesc, taskParams, taskCallback, translator, signal);
  } else if (taskDesc.type === 'wenku') {
    return translateWenku(
      taskDesc,
      taskParams,
      taskCallback,
      translator,
      signal,
    );
  } else {
    return translateLocal(
      taskDesc,
      taskParams,
      taskCallback,
      translator,
      signal,
    );
  }
};
