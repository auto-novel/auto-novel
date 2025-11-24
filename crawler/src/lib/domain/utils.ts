import { pipe } from 'fp-ts/lib/function.js';
import * as O from 'fp-ts/lib/Option.js';
import * as A from 'fp-ts/lib/Array.js';
import * as NA from 'fp-ts/lib/NonEmptyArray.js';

import { WebNovelAttention } from './types';

import type { Cheerio } from 'cheerio';

export const removeSuffix = (suffix: string) => (input: string) =>
  input.endsWith(suffix) ? input.slice(0, -suffix.length) : input;

export const removePrefix = (prefix: string) => (input: string) =>
  input.startsWith(prefix) ? input.slice(prefix.length) : input;

export const substringAfterLast = (delimiter: string) => (input: string) => {
  const index = input.lastIndexOf(delimiter);
  return index === -1 ? input : input.slice(index + delimiter.length);
};

export const stringToAttentionEnum = (
  tag: string,
): WebNovelAttention | null => {
  switch (tag) {
    case 'R15':
    case 'R-15':
      return WebNovelAttention.R15;
    case 'R18':
    case 'R-18':
      return WebNovelAttention.R18;
    case '残酷描写有り':
    case '残酷描写あり':
    case '残酷な描写':
    case '残酷な描写あり': // syosetu
      return WebNovelAttention.Cruelty;
    case '暴力描写有り':
    case '暴力描写あり':
      return WebNovelAttention.Violence;
    case '性描写有り':
    case '性的表現あり':
      return WebNovelAttention.SexualContent;
    default:
      return null;
  }
};

export const numExtractor = (text: string) =>
  pipe(
    O.fromNullable(text),
    O.map((text) => text.replace(/[^0-9]/g, '')),
    O.filter((text) => text.length > 0),
    O.map(Number),
    O.filter(Number.isFinite),
    O.toNullable,
  );

export function assertValid<T>(
  data: T | null | undefined | string,
  msg: string = 'data is null or undefined',
): asserts data is T {
  if (data === null || data === undefined) {
    throw new Error(msg);
  }
}

export function assertEl<T>(
  data: Cheerio<T>,
  msg: string = 'doc parse failed',
) {
  if (data.length === 0) throw new Error(msg);
}
