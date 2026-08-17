import { describe, expect, it } from 'vitest';

import {
  buildRubySegments,
  byteToUtf16,
  type SourceToken,
} from '../src/pages/reader/ruby/JapaneseRubyTokens';

describe('Japanese ruby token conversion', () => {
  it('splits the kanji out of mixed kanji-kana words', () => {
    const text = '食べる';
    const tokens: SourceToken[] = [
      {
        byteStart: 0,
        byteEnd: new TextEncoder().encode(text).length,
        text,
        reading: 'タベル',
      },
    ];

    expect(buildRubySegments(tokens, text)).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' },
    ]);
  });

  it('keeps UTF-8 byte offsets aligned with UTF-16 rendering offsets', () => {
    const text = '😀東京へ';
    const tokens: SourceToken[] = [
      {
        byteStart: 4,
        byteEnd: 10,
        text: '東京',
        reading: 'トウキョウ',
      },
    ];

    expect(byteToUtf16(4, text)).toBe(2);
    expect(buildRubySegments(tokens, text)).toEqual([
      { text: '😀' },
      { text: '東京', reading: 'とうきょう' },
      { text: 'へ' },
    ]);
  });

  it('does not annotate a kanji run containing an unknown token', () => {
    const text = '人妖大乱中には大将軍と妖母、対妖用に特化した。';
    const tokens: SourceToken[] = [
      tokenAt(text, 0, 1, 'ヒト'),
      tokenAt(text, 1, 2, '*'),
      tokenAt(text, 2, 4, 'タイラン'),
      tokenAt(text, 4, 5, 'チュウ'),
      tokenAt(text, 7, 10, 'ダイショウグン'),
      tokenAt(text, 11, 12, '*'),
      tokenAt(text, 12, 13, 'ハハ'),
      tokenAt(text, 14, 15, 'タイ'),
      tokenAt(text, 15, 16, '*'),
      tokenAt(text, 16, 17, 'ヨウ'),
      tokenAt(text, 18, 20, 'トッカ'),
    ];

    expect(buildRubySegments(tokens, text)).toEqual([
      { text: '人妖大乱中には' },
      { text: '大将軍', reading: 'だいしょうぐん' },
      { text: 'と妖母、対妖用に' },
      { text: '特化', reading: 'とっか' },
      { text: 'した。' },
    ]);
  });
});

function tokenAt(
  text: string,
  start: number,
  end: number,
  reading: string,
): SourceToken {
  const encoder = new TextEncoder();
  return {
    byteStart: encoder.encode(text.slice(0, start)).length,
    byteEnd: encoder.encode(text.slice(0, end)).length,
    text: text.slice(start, end),
    reading,
  };
}
