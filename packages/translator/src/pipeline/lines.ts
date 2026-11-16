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

const quotePairs = new Map([
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['"', '"'],
]);
const openingQuotes = new Map(
  [...quotePairs].map(([opening, closing]) => [closing, opening]),
);

/** 确认首引号直到行末才闭合，排除多段对白和异常嵌套。 */
function isWholeLineQuote(line: string): boolean {
  if (!quotePairs.has(line[0])) return false;
  const stack: string[] = [];
  for (let index = 0; index < line.length; index++) {
    const quote = line[index];
    const top = stack[stack.length - 1];
    if (openingQuotes.has(quote) && (quote !== '"' || top === '"')) {
      if (!top || quotePairs.get(top) !== quote) return false;
      stack.pop();
      if (!stack.length) return index === line.length - 1;
    } else if (quotePairs.has(quote)) {
      stack.push(quote);
    }
  }
  return false;
}

/** 仅修复完整引用中明确缺失的边界引号，不猜测跨行对白或嵌套异常。 */
function restoreBoundaryQuotes(original: string, content: string): string {
  const first = original[0];
  const last = original[original.length - 1];
  if (!isWholeLineQuote(original)) return content;

  const stack: Array<{ quote: string; index: number }> = [];
  const unmatchedClosing: number[] = [];
  let hasQuotes = false;
  for (let index = 0; index < content.length; index++) {
    const quote = content[index];
    if (!quotePairs.has(quote) && !openingQuotes.has(quote)) continue;
    hasQuotes = true;
    const top = stack[stack.length - 1];
    // 直引号无方向：优先闭合栈顶；孤立的行尾直引号视为右引号。
    const isClosing =
      openingQuotes.has(quote) &&
      (quote !== '"' || top?.quote === '"' || index === content.length - 1);
    if (!isClosing) {
      stack.push({ quote, index });
    } else if (!top) {
      unmatchedClosing.push(index);
    } else if (quotePairs.get(top.quote) === quote) {
      stack.pop();
    } else {
      return content;
    }
  }

  if (!hasQuotes) return first + content + last;
  if (stack.length === 1 && stack[0].index === 0 && !unmatchedClosing.length) {
    return content + quotePairs.get(stack[0].quote);
  }
  if (
    !stack.length &&
    unmatchedClosing.length === 1 &&
    unmatchedClosing[0] === content.length - 1
  ) {
    return openingQuotes.get(content[content.length - 1]) + content;
  }
  return content;
}

/** 恢复原文行首空白及缺失的边界引号，保留译文已有的引号样式。 */
export function restoreLineFormatting(
  originalLine: string,
  translatedLine: string,
): string {
  const heading = originalLine.match(/^\s*/)?.[0] ?? '';
  const original = originalLine.trim();
  const translated = translatedLine.trimStart();
  const content = translated.trimEnd();
  const trailing = translated.slice(content.length);
  return heading + restoreBoundaryQuotes(original, content) + trailing;
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
