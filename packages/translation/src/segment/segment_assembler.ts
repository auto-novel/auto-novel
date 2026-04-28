import { isEqual } from 'lodash-es';
import { filterGlossary } from '@/utils';
import type {
  Glossary,
  LineRange,
  Segment,
  SegmentAssembler,
  SegmentContext,
  TranslationHistory,
} from '@/types';

export const createSegmentAssembler = (): SegmentAssembler => {
  return {
    assemble(
      id: string,
      lines: string[],
      ranges: LineRange[],
      glossary: Glossary,
      onSegComplete: (segment: Segment, translatedLines: string[]) => void,
      onSegError: (segment: Segment, reason: any) => void,
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
