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

export const safeJson = <T extends object>(text: string) => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
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

export class Semaphore {
  private _current = 0;
  private queue: Array<() => void> = [];
  constructor(private _max: number) {
    if (_max <= 0)
      throw new Error('Semaphore max capacity must be greater than 0');
  }

  get max(): number {
    return this._max;
  }

  get current(): number {
    return this._current;
  }

  async acquire(): Promise<void> {
    if (this._current < this._max) {
      this._current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this._current--;
    }
  }

  setMax(max: number): void {
    if (max <= 0)
      throw new Error('Semaphore max capacity must be greater than 0');
    this._max = max;
    while (this.queue.length > 0 && this._current < this._max) {
      this._current++;
      const next = this.queue.shift()!;
      next();
    }
  }

  async use<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    let released = false;
    const safeRelease = () => {
      if (!released) {
        released = true;
        this.release();
      }
    };
    try {
      return await fn();
    } finally {
      safeRelease();
    }
  }
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
