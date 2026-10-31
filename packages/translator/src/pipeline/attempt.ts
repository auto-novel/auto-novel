import { isContentRejection, TranslationRejected } from '@/translator/errors';
import { validateTranslationLines } from '@/translation-lines';
import type { TranslateRequest, Translator } from '@/types';

/** 每个分段的最大尝试次数。 */
export const TRANSLATION_RETRIES = 3;

/**
 * 单次请求 → 结构校验 → 重试。
 * 只有内容形状问题（行数/退化）反复出现时才调用 `fallback`；
 * 传输错误与致命错误在重试耗尽后直接抛出。
 */
export async function attemptTranslation(
  translator: Translator,
  request: Omit<TranslateRequest, 'attempt'>,
): Promise<string[]> {
  const log = translator.log ?? (() => {});
  let contentFailures = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < TRANSLATION_RETRIES; attempt++) {
    request.signal?.throwIfAborted();
    let translated: string[];
    try {
      translated = await translator.translate({ ...request, attempt });
    } catch (error) {
      // 非软失败（取消、鉴权、参数错误等）不重试，直接交给调用方。
      if (!(error instanceof TranslationRejected)) throw error;
      if (isContentRejection(error)) contentFailures++;
      lastError = error;
      log(`第${attempt + 1}次　失败：${error.message}`);
      continue;
    }

    log(
      `第${attempt + 1}次　原文/输出：${request.lines.length}/${translated.length}行`,
    );
    try {
      validateTranslationLines(request.lines, translated);
      return translated;
    } catch (error) {
      contentFailures++;
      lastError = error;
      log(`输出错误：${error instanceof Error ? error.message : error}`);
    }
  }

  if (contentFailures === TRANSLATION_RETRIES && translator.fallback) {
    log('改用降级策略');
    const translated = await translator.fallback({ ...request, attempt: 0 });
    validateTranslationLines(request.lines, translated);
    return translated;
  }

  log(
    `翻译失败：${lastError instanceof Error ? lastError.message : lastError}`,
  );
  throw new Error('翻译失败：重试次数过多');
}
