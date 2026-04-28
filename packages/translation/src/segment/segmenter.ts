import type { LineRange, LineSegmenter } from '../types';

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
