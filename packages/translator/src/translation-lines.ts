/** 空行和图片不需要翻译，始终保留原文。 */
export const isPassthroughLine = (line: string): boolean =>
  line.trim().length === 0 || line.startsWith('<图片>');

/** 校验译文的行数与行内结构；不修改输入。 */
function assertTranslatedLines(
  translatedLines: string[],
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
  originalLines: string[],
  translatedLines: string[],
): void {
  assertTranslatedLines(translatedLines, originalLines.length);
}

/** 恢复原文行首空白，避免翻译器吞掉缩进。 */
export function restoreLineFormatting(
  originalLine: string,
  translatedLine: string,
): string {
  const heading = originalLine.match(/^\s*/)?.[0] ?? '';
  return heading + translatedLine.trimStart();
}

/**
 * 拆出需要翻译的内容行；空行与图片行留在原位，由 `mergeTranslatedLines` 回填。
 * 只有内容行会进入翻译器，避免模型吞掉或改动这些行。
 */
export function splitPassthroughLines(lines: string[]): {
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
  originalLines: string[],
  indexes: readonly number[],
  translatedLines: string[],
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
