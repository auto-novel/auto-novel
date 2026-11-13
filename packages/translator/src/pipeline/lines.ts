/** 空行和图片不需要翻译，始终保留原文。 */
export const isPassthroughLine = (line: string): boolean =>
  line.trim().length === 0 || line.startsWith('<图片>');

/** 校验译文的行数与行内结构；不修改输入。 */
function assertTranslatedLines(
  translatedLines: readonly string[],
  expectedLength: number,
): void {
  if (translatedLines.length !== expectedLength) {
    throw new Error('翻译结果行数不匹配');
  }
  for (const line of translatedLines) {
    if (typeof line !== 'string' || /[\r\n]/.test(line)) {
      throw new Error('译文行内包含换行或无效内容');
    }
  }
}

/** 校验逐行译文的数量和内容结构，不修改输入。 */
export function validateTranslationLines(
  originalLines: readonly string[],
  translatedLines: readonly string[],
): void {
  assertTranslatedLines(translatedLines, originalLines.length);
}

const DIALOGUE_QUOTES: Record<string, string> = {
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
};

/** 按原文匹配的首尾引号补齐非空译文边界，不改内部文本与空白。 */
export function restoreDialogueQuotes(
  originalLine: string,
  translatedLine: string,
): string {
  const original = originalLine.trim();
  const opening = original[0];
  const closing = DIALOGUE_QUOTES[opening];
  if (!closing || !original.endsWith(closing) || !translatedLine.trim()) {
    return translatedLine;
  }

  let result = translatedLine;
  if (!result.trimStart().startsWith(opening)) {
    result = result.replace(/^(\s*)/, `$1${opening}`);
  }
  if (!result.trimEnd().endsWith(closing)) {
    result = result.replace(/(\s*)$/, `${closing}$1`);
  }
  return result;
}

/** 恢复原文行首空白，并补齐对白边界。 */
export function restoreLineFormatting(
  originalLine: string,
  translatedLine: string,
): string {
  const heading = originalLine.match(/^\s*/)?.[0] ?? '';
  return (
    heading + restoreDialogueQuotes(originalLine, translatedLine.trimStart())
  );
}

/**
 * 拆出需要翻译的内容行；空行与图片行留在原位，由 `mergeTranslatedLines` 回填。
 * 只有内容行会进入翻译器，避免模型吞掉或改动这些行。
 */
export function splitPassthroughLines(lines: readonly string[]): {
  indexes: number[];
  content: string[];
} {
  const indexes: number[] = [];
  const content: string[] = [];
  lines.forEach((line, index) => {
    if (isPassthroughLine(line)) return;
    indexes.push(index);
    content.push(line);
  });
  return { indexes, content };
}

/** 把内容行的译文按 `indexes` 回填到原文，并恢复行首空白。 */
export function mergeTranslatedLines(
  originalLines: readonly string[],
  indexes: readonly number[],
  translatedLines: readonly string[],
): string[] {
  assertTranslatedLines(translatedLines, indexes.length);
  const result = [...originalLines];
  indexes.forEach((index, i) => {
    result[index] = restoreLineFormatting(
      originalLines[index],
      translatedLines[i],
    );
  });
  return result;
}

/** 输入须已通过结构校验，即译文与原文等行数。 */
export function postprocessTranslationLines(
  originalLines: readonly string[],
  translatedLines: readonly string[],
): string[] {
  validateTranslationLines(originalLines, translatedLines);
  return originalLines.map((original, index) =>
    isPassthroughLine(original)
      ? original
      : restoreLineFormatting(original, translatedLines[index]),
  );
}
