import {
  isPassthroughLine,
  validateTranslationLines,
} from '@/translation-lines';

/** 输入须已通过结构校验；不修改输入，可重复执行。 */
function restoreOriginalFormatting(
  originalLines: string[],
  translatedLines: string[],
): string[] {
  return originalLines.map((original, index) => {
    if (isPassthroughLine(original)) {
      return original;
    }
    const heading = original.match(/^\s*/)?.[0] ?? '';
    return heading + translatedLines[index].trimStart();
  });
}

/** 校验逐行译文并恢复原文格式。 */
export function postprocessTranslationLines(
  originalLines: string[],
  translatedLines: string[],
): string[] {
  validateTranslationLines(originalLines, translatedLines);
  return restoreOriginalFormatting(originalLines, translatedLines);
}
