import type { HarnessOutputFormat } from './presets';

export interface HarnessParagraph {
  id: string;
  text: string;
}

/**
 * 模型输出格式约定与解析。
 *
 * 不同模型对结构化输出的支持程度不一样，所以预设里可选三种格式：
 * - json：返回 {"translations": [...]}，适合支持 JSON mode 的接口；
 * - paragraph-id：逐行返回“段落ID#译文”，最容易发现漏段、串段；
 * - lines：一行一段，最省 token，但最依赖模型遵循指令的能力。
 *
 * 三种格式解析后都会归一成 string[]
 */
export const outputInstructions: Record<HarnessOutputFormat, string> = {
  json: '按本批顺序返回 JSON，例如 {"translations":["第一段译文","第二段译文"]}，数组中的译文不包含段落 ID。',
  'paragraph-id':
    '按本批顺序逐行返回“段落ID#译文”，使用 current_batch 中的对应 ID，例如 p0000#第一段译文。不输出 JSON、Markdown 或任何解释。',
  lines: '按本批顺序每行输出一段译文，不添加段落 ID、JSON、Markdown 或解释。',
};

export function parseBatchOutput(
  text: string,
  format: HarnessOutputFormat,
  paragraphs: HarnessParagraph[],
): string[] {
  const paragraphIds = paragraphs.map(({ id }) => id);
  const sourceLines = paragraphs.map(({ text: source }) => source);
  let translations: unknown;
  switch (format) {
    case 'json':
      translations = JSON.parse(text)?.translations;
      break;
    case 'paragraph-id':
      // 逐行校验模型是否按“本批段落 ID 顺序”返回：
      // 只要有一行 ID 对不上，就说明模型漏段、串段或改了顺序，
      // 校验失败交给批次纠正，不能接受错位译文。
      translations = text
        .trim()
        .split(/\r?\n/)
        .map((line, index) => {
          const prefix = `${paragraphIds[index]}#`;
          if (!line.startsWith(prefix)) {
            throw new Error(`段落 ID 不匹配，需要 ${paragraphIds[index]}`);
          }
          return line.slice(prefix.length);
        });
      break;
    case 'lines':
      translations = text.trim().split(/\r?\n/);
      break;
  }
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.every((line: unknown) => typeof line === 'string');
  if (!isStringArray(translations)) {
    throw new Error(`译文格式错误，需要 ${paragraphIds.length} 段单行译文`);
  }
  if (translations.some((line) => /[\r\n]/.test(line))) {
    throw new Error('译文格式错误，单段译文不能包含换行');
  }
  if (translations.length !== paragraphIds.length) {
    throw new Error(
      `译文段数错误，需要 ${paragraphIds.length} 段，实际 ${translations.length} 段`,
    );
  }
  let result = translations;
  if (format !== 'paragraph-id') {
    const markers = result.map(
      (line) => line.trimStart().match(/^p\d{4,}#/)?.[0],
    );
    if (
      markers.every((marker, index) => marker === `${paragraphIds[index]}#`)
    ) {
      // 仅整批编号与预期完全一致时去一层；原文本身的同名前缀保留。
      result = result.map((line, index) =>
        sourceLines[index].trimStart().startsWith(markers[index]!)
          ? line
          : line.trimStart().slice(markers[index]!.length),
      );
    } else if (
      markers.some(
        (marker, index) =>
          marker && !sourceLines[index].trimStart().startsWith(marker),
      )
    ) {
      throw new Error('译文段落编号混杂或与本批顺序不匹配');
    }
  }
  if (result.some((line) => !line.trim())) {
    throw new Error('译文包含空段，请重新返回完整的非空单行译文');
  }
  return result;
}
