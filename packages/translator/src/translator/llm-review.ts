import type { Glossary } from '@/types';
import { filterGlossaryForLines } from '@/utils';

type ReviewWord = {
  lineIndex: number;
  word: string;
  start: number;
  end: number;
};

const han = /\p{Script=Han}/u;
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const tokenPattern = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const technicalText = /[`<>{}@]|\w+:\/\/|[\w-]+\.[a-z][\w-]*/i;

function* foreignWords(text: string, source: string) {
  for (const token of text.matchAll(tokenPattern)) {
    const value = token[0];
    if (kana.test(value) && han.test(value) && source.includes(value)) {
      yield { word: value, start: token.index };
      continue;
    }
    let consumed = 0;
    for (const part of value.matchAll(/[^\p{Script=Han}]+/gu)) {
      let start = part.index;
      if (start < consumed) continue;
      let end = start + part[0].length;
      if (kana.test(part[0]) && han.test(value)) {
        if (!source.includes(part[0])) continue;
        // 中日文之间常常没有空格。沿原文找回「食べる」的汉字，避免只替换「べる」。
        while (
          start > consumed &&
          han.test(value[start - 1]) &&
          source.includes(value.slice(start - 1, end))
        )
          start--;
        while (
          end < value.length &&
          (han.test(value[end]) || kana.test(value[end])) &&
          source.includes(value.slice(start, end + 1))
        )
          end++;
      }
      yield { word: value.slice(start, end), start: token.index + start };
      consumed = end;
    }
  }
}

export function findReviewWords(
  source: readonly string[],
  translations: readonly string[],
  glossary: Glossary = {},
): ReviewWord[] {
  return translations.flatMap((translation, lineIndex) => {
    const original = source[lineIndex];
    if (
      !han.test(translation) ||
      translation.trim() === original.trim() ||
      technicalText.test(translation)
    )
      return [];

    const candidates = [...foreignWords(translation, original)];
    if (candidates.length === 0) return [];
    const terms = Object.values(filterGlossaryForLines(glossary, [original]));
    const protectedWords = new Set(
      terms.flatMap((term) =>
        Array.from(foreignWords(term, term), ({ word }) =>
          word.normalize('NFC').toLowerCase(),
        ),
      ),
    );
    const words: ReviewWord[] = [];
    for (const { word, start } of candidates) {
      // 混合大小写的品牌和全大写缩写保留。首字母大写也可能是德语普通名词。
      if (
        !/\p{L}/u.test(word) ||
        (/\p{Lu}/u.test(word) &&
          (word === word.toUpperCase() || /\p{Lu}/u.test(word.slice(1)))) ||
        /[\p{N}_]/u.test(word) ||
        protectedWords.has(word.normalize('NFC').toLowerCase())
      )
        continue;
      const end = start + word.length;
      if (
        han.test(word) &&
        !han.test(translation.slice(0, start)) &&
        !han.test(translation.slice(end))
      )
        continue;
      const previous = words[words.length - 1];
      if (previous && /^[ \t]+$/.test(translation.slice(previous.end, start))) {
        previous.end = end;
        previous.word = translation.slice(previous.start, end);
      } else {
        words.push({ lineIndex, word, start, end });
      }
    }
    // 先合并短语，保留 volver a casa 中的介词，同时跳过单独出现的字母变量。
    return words.filter(({ word }) => !/^\p{Ll}$/u.test(word));
  });
}

/** 只有编号明确、模型显式确认的短替换词才能改动译文。 */
export function applyWordReview(
  result: string[],
  words: ReviewWord[],
  answer: string,
) {
  const edits = new Map<number, string>();
  const seen = new Set<number>();
  for (const line of answer.trim().split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^#(\d+)[:：]\s*(.*)$/u.exec(line.trim());
    if (!match) return;
    const id = Number(match[1]) - 1;
    if (id < 0 || id >= words.length || seen.has(id)) return;
    seen.add(id);
    const replacement = /^REPLACE[:：]\s*(\p{Script=Han}{1,12})$/u.exec(
      match[2],
    );
    if (replacement) edits.set(id, replacement[1]);
  }
  // 逆序应用，确保同一行中每个片段的偏移都对应初译。
  for (let i = words.length - 1; i >= 0; i--) {
    const replacement = edits.get(i);
    if (!replacement) continue;
    const { lineIndex, start, end } = words[i];
    const line = result[lineIndex];
    const before = line
      .slice(0, start)
      .replace(/([\p{Script=Han}，。！？、：；「『（])[ \t]+$/u, '$1');
    const after = line
      .slice(end)
      .replace(/^[ \t]+(?=[\p{Script=Han}，。！？、：；」』）])/u, '');
    result[lineIndex] = before + replacement + after;
  }
}
