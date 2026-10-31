import {
  isPassthroughLine,
  restoreLineFormatting,
  validateTranslationLines,
} from '@/translation-lines';

/** 输入须已通过结构校验，即译文与原文等行数。 */
export function postprocessTranslationLines(
  originalLines: string[],
  translatedLines: string[],
): string[] {
  validateTranslationLines(originalLines, translatedLines);
  return originalLines.map((original, index) =>
    isPassthroughLine(original)
      ? original
      : restoreLineFormatting(original, translatedLines[index]),
  );
}
