import type { Glossary, SegmentContext } from '@/types';

// 这些片段属于格式或地址，模型应逐字保留。正则只匹配单行，避免吞掉正文。
const protectedPattern = new RegExp(
  [
    /https?:\/\/[^\s<>"'「」『』【】\u3000、。，！？]+/u,
    /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}/u,
    /<\/?[A-Za-z][^<>\r\n]*>/u,
    /\$\{[^{}\r\n]+\}|\{\{[^{}\r\n]+\}\}|\{(?:[A-Za-z_][\w.]*|\d+)\}/u,
    /%%|%(?:\d+\$)?[-+#0 ]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diuoxXfFeEgGaAcspn](?![A-Za-z])/u,
    /\\[nrt]/u,
  ]
    .map((pattern) => pattern.source)
    .join('|'),
  'gu',
);

const hasLetter = (text: string) => /\p{L}/u.test(text);

/** 只跳过明确的非正文；普通英文和纯汉字仍交给模型。 */
export function isGptPassthroughLine(
  line: string,
  glossary?: Glossary,
): boolean {
  const text = line.trim();
  if (!text || line.startsWith('<图片>')) return true;
  const natural = text.replace(protectedPattern, '').trim();
  if (!hasLetter(natural)) return true;
  if (
    !glossary?.[text]?.trim() &&
    /^(?:f\s*i\s*n|the\s+end|end)$/i.test(text.normalize('NFKC'))
  ) {
    return true;
  }
  // “URL→https://...”是地址标注；含链接的普通句子仍需翻译。
  return (
    /https?:\/\//i.test(text) &&
    /^(?:url|uri|link|参考url|参照url|リンク|网址|網址|链接|連結)$/i.test(
      natural.normalize('NFKC').replace(/[\p{P}\p{S}\s]+/gu, ''),
    )
  );
}

type ProtectedPart = { token: string; value: string };

/** 一次 GPT 请求的行映射与保护片段；不修改输入或历史译文。 */
export function prepareGptText(
  original: readonly string[],
  context?: SegmentContext,
) {
  let prefix = '__AN_KEEP_';
  const corpus = JSON.stringify({ original, context });
  while (corpus.includes(prefix)) prefix += '_';
  let sequence = 0;
  const rows = original.flatMap((source, index) => {
    if (isGptPassthroughLine(source, context?.glossary)) return [];
    const parts: ProtectedPart[] = [];
    const text = source.replace(protectedPattern, (value) => {
      const token = `${prefix}${sequence++}__`;
      parts.push({ token, value });
      return token;
    });
    return [{ index, source, text, parts }];
  });
  const lines = rows.map((row) => row.text);
  // GPT 默认提示词不使用 history。筛选或保护后不把旧的行映射交给自定义提示词。
  const changed =
    lines.length !== original.length ||
    lines.some((line, index) => line !== original[index]);
  const nextContext =
    changed && context?.history
      ? { ...context, history: undefined, expired: true }
      : context;

  const checkLine = (index: number, translated: string): string => {
    const row = rows[index];
    if (typeof translated !== 'string' || /[\r\n]/.test(translated)) {
      throw new Error('译文行内包含换行或无效内容');
    }
    const actual = translated.match(new RegExp(`${prefix}\\d+__`, 'g')) ?? [];
    if (
      actual.length !== row.parts.length ||
      row.parts.some(
        ({ token }) => actual.filter((part) => part === token).length !== 1,
      )
    ) {
      throw new Error('译文丢失、重复或混入了保护标记');
    }
    const tags = row.parts.filter(({ value }) => /^<\/?[A-Za-z]/.test(value));
    const actualTags = actual.filter((token) =>
      tags.some((part) => part.token === token),
    );
    if (tags.some((part, order) => part.token !== actualTags[order])) {
      throw new Error('译文改变了标签顺序');
    }
    return translated;
  };

  const languageText = (index: number, translated: string): string => {
    let text = checkLine(index, translated);
    for (const { token } of rows[index].parts) text = text.replace(token, '');
    return text;
  };

  const restoreLine = (index: number, translated: string): string => {
    let text = checkLine(index, translated);
    const { source, parts } = rows[index];
    for (const { token, value } of parts)
      text = text.replace(token, () => value);
    const leading = source.match(/^[^\S\r\n]*/u)?.[0] ?? '';
    const trailing = source.match(/[^\S\r\n]*$/u)?.[0] ?? '';
    return leading + text.trim() + trailing;
  };

  const restore = (translated: readonly string[]): string[] => {
    if (translated.length !== rows.length)
      throw new Error('翻译结果行数不匹配');
    const result = [...original];
    rows.forEach((row, index) => {
      result[row.index] = restoreLine(index, translated[index]);
    });
    return result;
  };

  return { lines, context: nextContext, restore, restoreLine, languageText };
}
