import type { PromptBuilder, SegmentContext } from '@/types';
import { filterGlossaryForLines } from '@/utils';

/** 编号仍能确定的有效行可留待下一次尝试复用。 */
export class PartialGptAnswer extends Error {
  constructor(readonly lines: readonly (string | undefined)[]) {
    super('行编号缺失、重复或包含额外换行');
    this.name = 'PartialGptAnswer';
  }
}

export const createOpenAiPromptBuilder = (): PromptBuilder => {
  const build = (lines: readonly string[], context?: SegmentContext) => {
    const glossary = context?.glossary ?? {};
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    //系统提示词
    messages.push({
      role: 'system',
      content:
        '你是一个轻小说翻译者，将下面的轻小说翻译成简体中文。要求翻译准确，译文流畅，尽量保持原文写作风格。要求人名和专有名词也要翻译成中文。既不要漏掉任何一句，也不要增加额外的说明。注意保持换行格式，译文的行数必须要和原文相等。',
    });

    //翻译提示词
    const parts: string[] = [];

    //术语表处理
    const filteredGlossary = filterGlossaryForLines(glossary, lines);
    const pairs = Object.keys(filteredGlossary)
      .sort()
      .map((jp) => [jp, filteredGlossary[jp]]);
    if (pairs.length > 0) {
      parts.push('翻译的时候参考下面的术语表：');
      for (const [jp, zh] of pairs) {
        parts.push(`${jp} => ${zh}`);
      }
    }

    if (context?.previousSource) {
      parts.push(
        '以下是前文原文，仅供理解上下文，不要翻译或输出这部分内容：',
        '<前文原文>',
        context.previousSource,
        '</前文原文>',
      );
    }

    parts.push('仅翻译以下当前原文，注意要保留每一段开头的编号：');
    parts.push(
      '以 __AN_KEEP_ 开头的保护标记必须逐字保留，不要增删、改写或移动标签标记。',
    );
    lines.forEach((line, i) => parts.push(`#${i + 1}:${line}`));
    if (lines.length === 1) {
      parts.push('原文到此为止'); // 防止乱编
    }

    messages.push({ role: 'user', content: parts.join('\n') });
    return messages;
  };

  const parseAnswer = (
    answer: string,
    originalLines: readonly string[],
  ): string[] => {
    const lineContentMap = new Map<number, string>();
    const invalid = new Set<number>();
    let previous = 0;

    for (const line of answer.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^```\w*$/.test(trimmed)) continue;

      const match = trimmed.match(/^#(\d+)(?:[:：]|\s+)(.*)/);
      if (match) {
        const lineNum = parseInt(match[1]);
        previous = lineNum;
        if (lineNum < 1 || lineNum > originalLines.length) continue;
        const content = match[2];
        if (lineContentMap.has(lineNum)) invalid.add(lineNum);
        lineContentMap.set(lineNum, content);
      } else if (previous > 0) {
        // 编号后的未编号续行无法安全合并，不悄悄丢掉这部分内容。
        invalid.add(previous);
      }
    }

    const lines = originalLines.map((_, index) =>
      invalid.has(index + 1) ? undefined : lineContentMap.get(index + 1),
    );
    if (lines.some((line) => line === undefined))
      throw new PartialGptAnswer(lines);
    return lines as string[];
  };

  return { build, parseAnswer };
};
