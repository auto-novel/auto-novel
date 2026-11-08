import { isEqual } from 'lodash-es';
import type {
  Glossary,
  LineRange,
  LineSegmenter,
  Segment,
  SegmentContext,
  TranslationHistory,
} from '@/types';
import { filterGlossaryForLines, getPreviousSource } from '@/utils';

export const createLineSegmenter = (
  maxLength?: number,
  maxLine?: number,
): LineSegmenter => {
  //注意：长度大于upper_len的单行，会单独成段
  const upperLen = maxLength ?? 32768; //默认设为32k
  const upperLine = maxLine ?? 32768;
  return {
    segment: (lines: readonly string[]): LineRange[] => {
      if (lines.length === 0) return []; //处理无文本情况

      const ranges: LineRange[] = [];
      let segStart = 0;
      let segChars = 0;

      for (let i = 0; i < lines.length; i++) {
        const isLastLine = i === lines.length - 1;
        const lineLen = lines[i].length + (isLastLine ? 0 : 1); //考虑换行符长度为 1

        const isCharLimitReached = segChars + lineLen > upperLen;
        const isLineLimitReached = i - segStart >= upperLine;

        if ((isCharLimitReached || isLineLimitReached) && i > segStart) {
          ranges.push({ start: segStart, end: i });
          segStart = i;
          segChars = 0;
        }
        //最后执行Size增加，防止超长单行
        segChars += lineLen;
      }
      if (segStart < lines.length) {
        ranges.push({ start: segStart, end: lines.length });
      }
      return ranges;
    },
  };
};

/** 组装分段，并根据原文、前文和术语表判定历史译文是否过期。 */
export function assembleSegments(
  id: string,
  lines: readonly string[],
  ranges: readonly LineRange[],
  glossary: Glossary,
  history?: TranslationHistory,
): Segment[] {
  return ranges.map((range, index) => {
    const { start, end } = range;

    const segLines = lines.slice(start, end);
    const previousSource = getPreviousSource(lines, start);
    const segGlossary = filterGlossaryForLines(glossary, segLines);

    let expired = true; //标记是否过期
    let segHistory: TranslationHistory | undefined;
    if (history) {
      const oldSegLines = history.lines.slice(start, end);
      const oldSegTranslatedLines = history.translatedLines.slice(start, end);
      const oldSegGlossary = filterGlossaryForLines(history.glossary, segLines);

      segHistory = {
        lines: oldSegLines,
        translatedLines: oldSegTranslatedLines,
        glossary: oldSegGlossary,
      };

      // 当前原文、前文原文和术语表一致才跳过。
      if (
        isEqual(segLines, oldSegLines) &&
        previousSource === getPreviousSource(history.lines, start) &&
        isEqual(segGlossary, oldSegGlossary)
      ) {
        expired = false;
      }
    }

    const segContext: SegmentContext = {
      glossary: segGlossary,
      previousSource,
      expired: expired,
      history: segHistory,
    };
    return {
      id,
      order: index,
      lines: segLines,
      context: segContext,
    };
  });
}
