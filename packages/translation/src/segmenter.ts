import { isEqual } from 'lodash-es';
import type {
  Glossary,
  LineRange,
  LineSegmenter,
  Segment,
  SegmentAssembler,
  SegmentContext,
  TranslationHistory,
} from './types';

export const createLineSegmenter = (
  maxLength?: number,
  maxLine?: number,
): LineSegmenter => {
  //注意：长度大于upper_len的单行，会单独成段
  const upperLen = maxLength ?? 32768; //默认设为32k
  const upperLine = maxLine ?? 32768;
  return {
    segment: (lines: string[]): LineRange[] => {
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

const filterGlossary = (glossary: Glossary, lines: string[]): Glossary => {
  const filtered: Glossary = {};
  for (const word in glossary) {
    if (lines.some((line) => line.includes(word))) {
      filtered[word] = glossary[word];
    }
  }
  return filtered;
};

// TODO: 考虑正向最大匹配？
/* 
const filterGlossary = (glossary: Glossary, text: string): Glossary => {
    const filtered: Glossary = {};
    const sortedWords = Object.keys(glossary).sort((a, b) => b.length - a.length);
    let tempText = text;
    for (const word of sortedWords) {
        if (tempText.includes(word)) {
            filtered[word] = glossary[word];
            tempText = tempText.split(word).join('\0'.repeat(word.length));
        }
    }
    return filtered;
};
*/

export const createSegmentAssembler = (): SegmentAssembler => {
  return {
    assemble(
      id: string,
      lines: string[],
      ranges: LineRange[],
      glossary: Glossary,
      onSegComplete: (translatedLines: string[]) => void,
      onSegError: (reason: any) => void,
      history?: TranslationHistory,
    ): Segment[] {
      return ranges.map((range, index) => {
        const { start, end } = range;

        const segLines = lines.slice(start, end);
        const segGlossary = filterGlossary(glossary, segLines);

        let expired = true; //标记是否过期
        let segHistory: TranslationHistory | undefined;
        if (history) {
          const oldSegLines = history.lines.slice(start, end);
          const oldSegTranslatedLines = history.translatedLines.slice(
            start,
            end,
          );
          const oldSegGlossary = filterGlossary(history.glossary, segLines);

          segHistory = {
            lines: oldSegLines,
            translatedLines: oldSegTranslatedLines,
            glossary: oldSegGlossary,
          };

          //原文一致，且术语表一致才跳过
          if (
            isEqual(segLines, oldSegLines) &&
            isEqual(segGlossary, oldSegGlossary)
          ) {
            expired = false;
          }
        }

        const segContext: SegmentContext = {
          glossary: segGlossary,
          prevSegs: [],
          expired: expired,
          history: segHistory,
        };
        const segment: Segment = {
          id: id,
          order: index,
          lines: segLines,
          context: segContext,
          onComplete: onSegComplete,
          onError: onSegError,
        };
        return segment;
      });
    },
  };
};
