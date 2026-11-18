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
    if (source.length >= maxLength) {
      // 截断点可能落在代理对中间，跳过残留的低代理项。
      return source.slice(-maxLength).replace(/^[\uDC00-\uDFFF]/, '');
    }
  }
  return source;
}

export const RegexUtil = (() => {
  const englishChars = /[a-z]|[A-Z]/;
  const hasEnglishChars = (str: string) => englishChars.test(str);

  const hanzi = /[\u4E00-\u9FAF]/;
  const hasHanzi = (str: string) => hanzi.test(str);

  const kanaChars = /[\u3041-\u3096]|[\u30A1-\u30FA]/;
  const hasKanaChars = (str: string) => kanaChars.test(str);

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
  const hasHangulChars = (str: string) =>
    hangulSyllables.test(str) ||
    hangulJamo.test(str) ||
    hangulEnclosed.test(str) ||
    hangulHalfWidth.test(str);

  return { hasEnglishChars, hasHanzi, hasKanaChars, hasHangulChars };
})();

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
