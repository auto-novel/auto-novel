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
});
