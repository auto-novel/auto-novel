import {
  type TranslationResult,
  type TranslationTask,
  type Translator,
} from '../types';

import { createOpenAiApi, OpenAiError } from '../api/OpenAiApi';
import { delay, detectChinese } from '../utils';

export interface OpenAiTranslatorConfig {
  id: string;
  type: 'gpt';
  concurrency: number;
  model: string;
  endpoint: string;
  key: string;
}

export class OpenAiTranslator implements Translator {
  public readonly id: string;
  public readonly type: 'gpt';
  public readonly concurrency: number;

  private readonly api: ReturnType<typeof createOpenAiApi>;
  private readonly model: string;

  constructor(config: OpenAiTranslatorConfig) {
    this.id = config.id;
    this.type = config.type;
    this.concurrency = config.concurrency;
    this.model = config.model;
    this.api = createOpenAiApi(config.endpoint, config.key);
  }

  async translate(task: TranslationTask): Promise<TranslationResult> {
    const lines = task.text.split('\n');
    try {
      const translatedLines = await this.translateWithRetries(
        lines,
        task.glossary || {},
      );
      const translatedText = translatedLines.join('\n');

      return {
        taskId: task.id,
        status: 'success',
        translatedText,
      };
    } catch (e: any) {
      return {
        taskId: task.id,
        status: 'error',
        error: e.message || 'OpenAiTranslator发生未知错误',
      };
    }
  }

  private async translateWithRetries(
    seg: string[],
    glossary: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string[]> {
    let retry = 0;
    let error_msg = '';
    while (retry < 3) {
      const result = await this.translateLines(seg, glossary, signal);

      if ('answer' in result) {
        // 校验行数是否一致
        if (seg.length === result.answer.length) {
          // TODO: 目前直接进行中文检测。未来可能根据任务的目标语言来决定检测什么语言。
          const isChinese = detectChinese(result.answer.join(' '));
          if (!isChinese) {
            console.warn('输出不是中文，正在重试...');
            error_msg = '输出不是中文';
            retry++;
            continue;
          }
          return result.answer;
        }
        console.warn(
          `行数不匹配: 预期 ${seg.length} 行, 实际得到 ${result.answer.length} 行. 正在重试...`,
        );
        error_msg = '行数不匹配';
      } else {
        error_msg = 'API错误';
        await this.handleError(result, signal);
      }
      retry++;
    }
    throw new Error(`在3次尝试后无法获得正确的翻译结果(${error_msg})`);
  }

  private async translateLines(
    lines: string[],
    glossary: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<
    { message: string; delaySeconds?: number } | { answer: string[] }
  > {
    const parseAnswer = (answer: string) => {
      return answer
        .split('\n')
        .filter((s) => s.trim())
        .map((s, i) =>
          s
            .replace(new RegExp(`^#${i + 1}[:：]`), '') // 移除 #1: 或 #1：
            .trim(),
        );
    };

    const messages = buildMessages(lines, glossary);
    try {
      const completionStream = await this.api.createChatCompletionsStream(
        {
          messages: messages.map(([role, content]) => ({ content, role })),
          model: this.model,
          stream: true,
        },
        { signal },
      );

      let answer = '';
      for await (const chunk of completionStream) {
        answer += chunk.choices[0]?.delta.content || '';
      }

      return { answer: parseAnswer(answer) };
    } catch (e: unknown) {
      if (e instanceof OpenAiError) {
        // 处理常见的 429 错误
        if (e.code === 'rate_limit_exceeded' || e.status === 429) {
          return { message: 'Rate limit exceeded', delaySeconds: 15 };
        }
        return { message: e.message };
      }
      return { message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async handleError(
    error: { message: string; delaySeconds?: number },
    signal?: AbortSignal,
  ) {
    if (error.delaySeconds && error.delaySeconds > 0) {
      await delay(error.delaySeconds * 1000, signal);
      return;
    }
    throw new Error(`OpenAI API 错误: ${error.message}`);
  }
}

const buildMessages = (
  lines: string[],
  glossary: Record<string, string>,
): ['user' | 'assistant', string][] => {
  const parts = [
    '请你作为一个轻小说翻译者，将下面的轻小说翻译成简体中文。要求翻译准确，译文流畅，尽量保持原文写作风格。要求人名和专有名词也要翻译成中文。既不要漏掉任何一句，也不要增加额外的说明。注意保持换行格式，译文的行数必须要和原文相等。',
  ];

  const matchedWordPairs: [string, string][] = [];
  for (const jp in glossary) {
    for (const line of lines) {
      if (line.includes(jp)) {
        matchedWordPairs.push([jp, glossary[jp]]);
        break;
      }
    }
  }
  if (matchedWordPairs.length > 0) {
    parts.push('翻译的时候参考下面的术语表：');
    for (const [jp, zh] of matchedWordPairs) {
      parts.push(`${jp} => ${zh}`);
    }
  }

  parts.push('小说原文如下，注意要保留每一段开头的编号：');
  lines.forEach((line, i) => parts.push(`#${i + 1}:${line}`));
  if (lines.length === 1) parts.push('原文到此为止'); // 防止乱编
  const prompt = parts.join('\n');

  return [['user', prompt]];
};
