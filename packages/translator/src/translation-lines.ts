/** 空行和图片不需要翻译，始终保留原文。 */
export const isPassthroughLine = (line: string): boolean =>
  line.trim().length === 0 || line.startsWith('<图片>');

/** 校验逐行译文的数量和内容结构，不修改输入。 */
export function validateTranslationLines(
  originalLines: string[],
  translatedLines: string[],
): void {
  if (translatedLines.length !== originalLines.length) {
    throw new Error('翻译结果行数不匹配');
  }
  for (const line of translatedLines) {
    if (typeof line !== 'string' || /[\r\n]/.test(line)) {
      throw new Error('译文行内包含换行或无效内容');
    }
  }
}
