import type { Glossary } from '@/types';

export const filterGlossaryForLines = (
  glossary: Glossary,
  lines: readonly string[],
): Glossary => {
  const filtered: Record<string, string> = {};
  for (const word in glossary) {
    if (lines.some((line) => line.includes(word))) {
      filtered[word] = glossary[word];
    }
  }
  return filtered;
};

/** 从当前位置向前截取有界原文；不包含当前行，也不依赖任何译文。 */
export function getPreviousSource(
  lines: readonly string[],
  end: number,
  maxLength = 500,
): string {
  if (maxLength <= 0) return '';
  let source = '';
  for (let i = end - 1; i >= 0; i--) {
    source = lines[i] + (i < end - 1 ? '\n' : '') + source;
    if (source.length >= maxLength) return source.slice(-maxLength);
  }
  return source;
}

export namespace RegexUtil {
  const englishChars = /[a-z]|[A-Z]/;
  export const hasEnglishChars = (str: string) => englishChars.test(str);

  const hanzi = /[\u4E00-\u9FAF]/;
  export const hasHanzi = (str: string) => hanzi.test(str);

  const kanaChars = /[\u3041-\u3096]|[\u30A1-\u30FA]/;
  export const hasKanaChars = (str: string) => kanaChars.test(str);

  // U+1100–U+11FF: Hangul Jamo
  // U+3130–U+318F: Hangul Compatibility Jamo
  // U+A960–U+A97F: Hangul Jamo Extended-A
  // U+D7B0–U+D7FF: Hangul Jamo Extended-B
  const hangulJamo =
    /[\u1100-\u11FF]|[\u3130-\u318F]|[\uA960-\uA97F]|[\uD7B0-\uD7FF]/;

  // U+3200–U+321E: Parenthesised Hangul
  // U+3260–U+327E: Circled Hangul
  const hangulEnclosed = /[\u3200-\u321E]|[\u3260-\u327E]/;

  // U+FFA0–U+FFDC: Half-width Hangul
  const hangulHalfWidth = /[\uFFA0-\uFFDC]/;

  // U+AC00–U+D7A3: Hangul Syllables
  const hangulSyllables = /[\uAC00-\uD7AF]/;

  // https://en.wikipedia.org/wiki/Hangul#Unicode
  export const hasHangulChars = (str: string) =>
    hangulSyllables.test(str) ||
    hangulJamo.test(str) ||
    hangulEnclosed.test(str) ||
    hangulHalfWidth.test(str);
}

/**
 * 日站常见缺 h 的 ttps/ttp，以及 www. 无协议链接。
 * 字符集限定为 URL 合法字符，避免吞掉紧挨其后的汉字。
 */
const URL_CHAR = String.raw`[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]`;
const URL_TOKEN_SOURCE = String.raw`h?ttps?:\/\/${URL_CHAR}+|\bwww\.${URL_CHAR}+`;

export const stripUrlTokens = (text: string): string =>
  text.replace(new RegExp(URL_TOKEN_SOURCE, 'gi'), '');

export const hasUrlToken = (text: string): boolean =>
  new RegExp(URL_TOKEN_SOURCE, 'i').test(text);

const isHanzi = (c: string) => /[\u4e00-\u9fa5]/.test(c);

/** 是否含需做语言判断的字符（汉字 / 假名 / 拉丁字母）。 */
export const hasLinguisticChars = (text: string): boolean => {
  for (const c of text) {
    if (
      isHanzi(c) ||
      RegexUtil.hasKanaChars(c) ||
      RegexUtil.hasEnglishChars(c)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * 判断译文是否主要为中文。
 * 只对语言字符计数，避免标点/URL 稀释比例；剥 URL 后若无可检语言，
 * 有 URL 或仍有非空白符号则通过，全空则失败（防止模型交白卷）。
 */
export const detectChinese = (text: string) => {
  const hadUrl = hasUrlToken(text);
  const cleaned = stripUrlTokens(text);

  let zh = 0,
    jp = 0,
    en = 0;
  for (const c of cleaned) {
    if (isHanzi(c)) {
      zh++;
    } else if (RegexUtil.hasKanaChars(c)) {
      jp++;
    } else if (RegexUtil.hasEnglishChars(c)) {
      en++;
    }
  }

  const linguistic = zh + jp + en;
  if (linguistic === 0) {
    return hadUrl || cleaned.trim().length > 0;
  }

  const pZh = zh / linguistic;
  const pJp = jp / linguistic;
  const pEn = en / linguistic;
  return pZh > 0.75 || (pZh > pJp && pZh > pEn * 2 && pJp < 0.1);
};

export const safeJson = <T extends object>(text: string) => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

/** 取消不是失败，重试逻辑一律直接放行。 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * 合并多个取消信号；任一来源取消即取消。
 * 优先用原生 `AbortSignal.any`，缺失时退化为手动转发。
 */
export function anySignal(
  signals: ReadonlyArray<AbortSignal | undefined>,
): AbortSignal | undefined {
  const list = signals.filter((signal): signal is AbortSignal => !!signal);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);

  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

export function randomUUID(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
