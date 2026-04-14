import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAiTranslator,
  OpenAiTranslatorConfig,
} from '../../src/translators/OpenAiTranslator';
import { createOpenAiApi, OpenAiError } from '../../src/api/OpenAiApi';
import { TranslationTask } from '../../src/types';

// Mock API 模块
vi.mock('../../src/api/OpenAiApi', () => ({
  createOpenAiApi: vi.fn(),
  OpenAiError: class extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

// Mock delay 工具函数，避免测试等待
vi.mock('../../src/utils', () => ({
  delay: vi.fn(() => Promise.resolve()),
  parseEventStream: vi.fn(),
}));

describe('OpenAiTranslator', () => {
  // 配置修正：使用 'gpt' 作为 TranslatorType
  const mockConfig: OpenAiTranslatorConfig = {
    id: 'test-gpt',
    type: 'gpt',
    concurrency: 1,
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com',
    key: 'sk-xxx',
  };

  const testText =
    '国境の長いトンネルを抜けると雪国であった。\n夜の底が白くなった。\n信号所に汽車が止まった。';

  const baseTask: TranslationTask = {
    id: 'task-123',
    text: testText,
    sourceLang: 'ja',
    targetLang: 'zh',
    translatorType: 'gpt',
  };

  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      createChatCompletionsStream: vi.fn(),
    };
    (createOpenAiApi as any).mockReturnValue(mockApi);
  });

  // 辅助函数：模拟流式返回
  const mockStreamResponse = (translatedLines: string[]) => {
    const content = translatedLines
      .map((line, i) => `#${i + 1}:${line}`)
      .join('\n');
    async function* generator() {
      yield { choices: [{ delta: { content } }] };
    }
    mockApi.createChatCompletionsStream.mockResolvedValue(generator());
  };

  it('成功翻译：应返回 success 状态并包含翻译文本', async () => {
    const translator = new OpenAiTranslator(mockConfig);
    mockStreamResponse([
      '穿过长长的国境隧道，就是雪国了。',
      '夜空下一片白茫茫。',
      '火车在信号所停了下来。',
    ]);

    const result = await translator.translate(baseTask);

    if (result.status === 'success') {
      expect(result.translatedText).toContain('雪国');
      expect(result.translatedText.split('\n')).toHaveLength(3);
    } else {
      throw new Error('应该返回 success 状态');
    }
  });

  it('类型兼容性：应正确处理 TranslationTask 中定义的字段', async () => {
    const translator = new OpenAiTranslator(mockConfig);
    mockStreamResponse(['译文1', '译文2', '译文3']);

    const result = await translator.translate({
      ...baseTask,
      id: 'specific-id',
    });

    expect(result.taskId).toBe('specific-id');
  });

  it('重试机制：当行数不匹配时，应重试直到成功', async () => {
    const translator = new OpenAiTranslator(mockConfig);

    // 第一次模拟行数不对（1行），第二次模拟正确（3行）
    const failGen = async function* () {
      yield { choices: [{ delta: { content: '#1:错误行数' } }] };
    };
    const successGen = async function* () {
      yield { choices: [{ delta: { content: '#1:1\n#2:2\n#3:3' } }] };
    };

    mockApi.createChatCompletionsStream
      .mockResolvedValueOnce(failGen())
      .mockResolvedValueOnce(successGen());

    const result = await translator.translate(baseTask);

    expect(mockApi.createChatCompletionsStream).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('success');
  });

  it('错误处理：达到最大尝试次数后返回 error 状态', async () => {
    const translator = new OpenAiTranslator(mockConfig);

    // 始终返回错误的行数
    const failGen = async function* () {
      yield { choices: [{ delta: { content: '#1:只有一行' } }] };
    };
    mockApi.createChatCompletionsStream.mockResolvedValue(failGen());

    const result = await translator.translate(baseTask);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('3次尝试后无法获得正确的翻译结果');
    }
    expect(mockApi.createChatCompletionsStream).toHaveBeenCalledTimes(3);
  });
});
