import { isKanji, toHiragana, toKatakana } from 'wanakana';

import type { RubySegment } from './types';

export interface SourceToken {
  byteEnd: number;
  byteStart: number;
  reading: string;
  text: string;
}

interface RubyToken {
  end: number;
  original: string;
  reading: string;
  start: number;
}

interface TextRange {
  end: number;
  start: number;
}

type SimplifiedToken = RubyToken;

interface KanaChunk {
  end: number;
  original: string;
  start: number;
}

export function buildRubySegments(
  tokens: SourceToken[],
  text: string,
): RubySegment[] {
  const rubyTokens = toKanjiTokens(tokens, text)
    .filter(
      (token) =>
        token.start >= 0 && token.end <= text.length && token.start < token.end,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const segments: RubySegment[] = [];
  let cursor = 0;
  for (const token of rubyTokens) {
    if (token.start < cursor) continue;
    if (token.start > cursor) {
      segments.push({ text: text.slice(cursor, token.start) });
    }
    segments.push({
      text: token.original,
      reading: toHiragana(token.reading),
    });
    cursor = token.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments.length > 0 ? segments : [{ text }];
}

function toKanjiTokens(tokens: SourceToken[], text: string): RubyToken[] {
  const uncertainRanges = findUncertainKanjiRanges(tokens, text);

  return tokens
    .filter(
      (token) =>
        /\p{Script=Han}/u.test(token.text) &&
        Boolean(token.reading && token.reading !== '*'),
    )
    .map<SimplifiedToken>((token) => ({
      start: byteToUtf16(token.byteStart, text),
      end: byteToUtf16(token.byteEnd, text),
      original: token.text,
      reading: token.reading,
    }))
    .filter(
      (token) =>
        !uncertainRanges.some(
          (range) => token.start < range.end && token.end > range.start,
        ),
    )
    .flatMap(splitMixedToken);
}

function findUncertainKanjiRanges(
  tokens: SourceToken[],
  text: string,
): TextRange[] {
  const unknownRanges = tokens
    .filter(
      (token) =>
        /\p{Script=Han}/u.test(token.text) &&
        (!token.reading || token.reading === '*'),
    )
    .map<TextRange>((token) => ({
      start: byteToUtf16(token.byteStart, text),
      end: byteToUtf16(token.byteEnd, text),
    }));
  if (unknownRanges.length === 0) return [];

  return Array.from(
    text.matchAll(/[\p{Script=Han}々〆ヵヶ]+/gu),
    (match): TextRange => ({
      start: match.index,
      end: match.index + match[0].length,
    }),
  ).filter((range) =>
    unknownRanges.some(
      (unknown) => unknown.start < range.end && unknown.end > range.start,
    ),
  );
}

export function byteToUtf16(byteIndex: number, text: string): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  let utf16Index = 0;
  for (const character of text) {
    bytes += encoder.encode(character).length;
    if (bytes > byteIndex) return utf16Index;
    utf16Index += character.length;
  }
  return utf16Index;
}

function splitMixedToken(token: SimplifiedToken): RubyToken[] {
  if (isKanji(token.original)) return [token];

  const kanaChunks = Array.from(
    token.original.matchAll(/[\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu),
    (match): KanaChunk => ({
      original: toKatakana(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
  if (kanaChunks.length === 0) return [token];

  const readingPattern = buildReadingPattern(kanaChunks, token.original.length);
  const readingParts = token.reading.match(readingPattern)?.slice(1);
  const kanjiMatches = Array.from(token.original.matchAll(/\p{Script=Han}+/gu));
  if (!readingParts || readingParts.length !== kanjiMatches.length) {
    return [token];
  }

  return kanjiMatches.map((match, index) => ({
    original: match[0],
    reading: readingParts[index]!,
    start: token.start + match.index,
    end: token.start + match.index + match[0].length,
  }));
}

function buildReadingPattern(
  kanaChunks: KanaChunk[],
  originalLength: number,
): RegExp {
  const first = kanaChunks[0]!;
  const last = kanaChunks[kanaChunks.length - 1]!;
  let pattern = '^';

  if (first.start > 0) pattern += '(.+)';
  for (const chunk of kanaChunks) {
    pattern += chunk.original;
    if (chunk !== last) pattern += '(.+)';
  }
  if (last.end !== originalLength) pattern += '(.+)';

  return new RegExp(`${pattern}$`, 'u');
}
