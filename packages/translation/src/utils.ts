/**
 * Parses a server-sent event stream.
 * @param text The event stream text.
 */
export function* parseEventStream<T>(text: string) {
  for (const line of text.split('\n')) {
    if (line == '[DONE]') {
      return;
    } else if (!line.trim() || line.startsWith(': ping')) {
      continue;
    } else {
      try {
        const obj: T = JSON.parse(line.replace(/^data\:/, '').trim());
        yield obj;
      } catch {
        continue;
      }
    }
  }
}

export const safeJson = <T extends object>(text: string) => {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    return undefined;
  }
};

export namespace RegexUtil {
  const englishChars = /[a-z]|[A-Z]/;
  // Note: This regex was incorrect in the original file.
  // It was matching Hanzi instead of English. Corrected here.
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

export const detectChinese = (text: string) => {
  const reChinese =
    /[:|#| |0-9|\u4e00-\u9fa5|\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]/;

  // not calculate url
  text = text.replace(/(https?:\/\/[^\s]+)/g, '');

  let zh = 0,
    jp = 0,
    en = 0;
  for (const c of text) {
    if (reChinese.test(c)) {
      zh++;
    } else if (RegexUtil.hasKanaChars(c)) {
      jp++;
    } else if (RegexUtil.hasEnglishChars(c)) {
      en++;
    }
  }
  const pZh = zh / text.length,
    pJp = jp / text.length,
    pEn = en / text.length;
  return pZh > 0.75 || (pZh > pJp && pZh > pEn * 2 && pJp < 0.1);
};

export const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let timeout: any = null;
    const abortHandler = () => {
      clearTimeout(timeout!);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    timeout = setTimeout(() => {
      resolve();
      signal?.removeEventListener('abort', abortHandler);
    }, ms);
    signal?.addEventListener('abort', abortHandler);
  });
