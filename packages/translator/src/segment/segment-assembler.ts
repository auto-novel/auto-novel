import { isEqual } from 'lodash-es';
import type {
  Glossary,
  LineRange,
  Segment,
  SegmentAssembler,
  SegmentContext,
  TranslationHistory,
} from '@/types';
import { filterGlossaryForLines, getPreviousSource } from '@/utils';

export const createSegmentAssembler = (): SegmentAssembler => {
  return {
    assemble(
      id: string,
      lines: string[],
      ranges: LineRange[],
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
          const oldSegTranslatedLines = history.translatedLines.slice(
            start,
            end,
          );
          const oldSegGlossary = filterGlossaryForLines(
            history.glossary,
            segLines,
          );

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
    },
  };
};
