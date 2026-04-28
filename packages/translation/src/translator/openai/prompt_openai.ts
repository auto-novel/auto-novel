import type { PromptBuilder, SegmentContext } from '@/types';

export const createOpenAiPromptBuilder = (): PromptBuilder => {
  return (lines: string[], context?: SegmentContext) => {
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
    const pairs = Object.entries(glossary);
    if (pairs.length > 0) {
      parts.push('翻译的时候参考下面的术语表：');
      for (const [jp, zh] of pairs) {
        parts.push(`${jp} => ${zh}`);
      }
    }

    parts.push('小说原文如下，注意要保留每一段开头的编号：');
    lines.forEach((line, i) => parts.push(`#${i + 1}:${line}`));
    if (lines.length === 1) {
      parts.push('原文到此为止'); // 防止乱编
    }

    messages.push({ role: 'user', content: parts.join('\n') });
    return messages;
  };
};
