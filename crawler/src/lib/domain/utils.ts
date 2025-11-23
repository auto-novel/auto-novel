import { WebNovelAttention } from './types';

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

export function assertValid<T>(
  data: T | null | undefined,
  msg: string = 'data is null or undefined',
): asserts data is T {
  if (data === null || data === undefined) {
    throw new Error(msg);
  }
}
