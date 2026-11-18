import type { Glossary } from '@/types';
import { filterGlossaryForLines, RegexUtil } from '@/utils';

/** 只复核日文原文对应的中文句子中、夹在汉字之间的小写英文词。 */
export function findMixedEnglishWords(
  source: readonly string[],
  translations: readonly string[],
  glossary: Glossary = {},
) {
  return translations.flatMap((translation, lineIndex) => {
    const original = source[lineIndex];
    if (
      !RegexUtil.hasKanaChars(original) ||
      /[`<>]|https?:\/\/|www\./i.test(translation)
    )
      return [];

    const matches = [
      ...translation.matchAll(
        /(\p{Script=Han})([ \t]*([a-z]{4,})[ \t]*)(?=\p{Script=Han})/gu,
      ),
    ];
    if (matches.length === 0) return [];

    const knownText = [
      original,
      ...Object.values(filterGlossaryForLines(glossary, [original])),
    ];
    const knownWords = new Set(
      knownText
        .join(' ')
        .toLowerCase()
        .match(/[a-z]+/g),
    );
    return matches.flatMap((match) => {
      const [, preceding, fragment, word] = match;
      if (knownWords.has(word)) return [];
      const start = match.index + preceding.length;
      return [{ lineIndex, word, start, end: start + fragment.length }];
    });
  });
}
