import { RegexUtil } from './index';

/** raw 保留全文语法，tag 保存解码后的标签值；excluded 仅表示标签排除。 */
export interface SearchQueryToken {
  raw: string;
  tag: string | null;
  excluded: boolean;
}

/**
 * 只在双引号外按空白分词，单次扫描 O(n)，不解释字段前缀。
 * 未闭合的引号延续到输入末尾；规则与后端解析器保持一致。
 */
export function parseSearchQuery(input: string): SearchQueryToken[] {
  const tokens: SearchQueryToken[] = [];
  const value: string[] = [];
  let start = -1;
  let inQuotes = false;
  let tagSuffix = false;

  const finish = (end: number) => {
    if (start < 0) return;
    const raw = input.slice(start, end);
    // 引号内的前导负号属于标签名，不表示排除条件。
    const excluded = tagSuffix && raw.startsWith('-');
    tokens.push({
      raw,
      tag: tagSuffix ? value.slice(excluded ? 1 : 0, -1).join('') : null,
      excluded,
    });
    start = -1;
    value.length = 0;
    tagSuffix = false;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (!inQuotes && /\s/u.test(char)) {
      finish(i);
      continue;
    }
    if (start < 0) start = i;
    tagSuffix = false;
    const next = input[i + 1];
    // 仅解码引号和反斜杠，未知转义按原文保留。
    if (char === '\\' && (next === '"' || next === '\\')) {
      value.push(next);
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else {
      value.push(char);
      // 只有片段最后一个字符是引号外的 '$'，才提取为标签。
      tagSuffix = char === '$' && !inQuotes;
    }
  }
  finish(input.length);
  return tokens;
}

/** 构造可再次解析的标签表达式；引用前导负号，避免误判为排除条件。 */
export function formatSearchTag(tag: string): string {
  if (/[\s"\\]/u.test(tag) || tag.startsWith('-')) {
    return `"${tag.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"$`;
  }
  return `${tag}$`;
}

/** 仅扩展未引用的普通文本，标签和引用文本不参与简繁改写。 */
export function convertSearchQuery(
  input: string,
  toData: (text: string) => string,
): string {
  const result: string[] = [];
  let offset = 0;
  for (const token of parseSearchQuery(input)) {
    // 按原始位置拼接，保留片段之间的空白。
    const start = input.indexOf(token.raw, offset);
    result.push(input.slice(offset, start));
    if (token.tag !== null || token.raw.includes('"')) {
      result.push(token.raw);
    } else {
      result.push(
        token.raw
          .split(/(\||\+|\-)/)
          .map((part) => {
            if (
              !RegexUtil.hasKanaChars(part) &&
              !RegexUtil.hasHangulChars(part) &&
              RegexUtil.hasHanzi(part)
            ) {
              const converted = toData(part);
              if (converted !== part) return `(${part}|${converted})`;
            }
            return part;
          })
          .join(''),
      );
    }
    offset = start + token.raw.length;
  }
  result.push(input.slice(offset));
  return result.join('');
}
