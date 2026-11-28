import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { OpenAiTranslator } from '../src/translator/llm';
import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';
import { TranslationPipeline } from '../src/pipeline/pipeline';

// ============================================================
// OpenAiTranslator 业务翻译器测试
// ============================================================
describe('OpenAiTranslator', () => {
  afterEach(() => vi.unstubAllGlobals());

  const mockStreamResponse = (events: unknown[]) =>
    new Response(
      events
        .map((data) => `data: ${JSON.stringify(data)}\n\n`)
        .concat('data: [DONE]\n\n')
        .join(''),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );

  it('切换思考强度或端点时重新请求，等效配置和切回原配置时命中缓存', async () => {
    const fetch = vi.fn(async () =>
      mockStreamResponse([
        {
          choices: [
            {
              index: 0,
              delta: { content: `#1:译文${fetch.mock.calls.length}` },
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const entries = new Map<string, readonly string[]>();
    const pipeline = new TranslationPipeline({
      cache: {
        get: async (key) => entries.get(key),
        set: async (key, lines) => {
          entries.set(key, lines);
        },
      },
    });
    const config = {
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
    };
    const low = { id: 'openai', values: { reasoning_effort: 'low' } } as const;
    const high = {
      id: 'openai',
      values: { reasoning_effort: 'high' },
    } as const;
    const translate = async (translator: OpenAiTranslator) => {
      const id = pipeline.registerTranslator(translator);
      try {
        return await pipeline.translate({ lines: ['原文'] });
      } finally {
        pipeline.unregisterTranslator(id);
      }
    };
    try {
      for (const [endpoint, profile, expected, calls] of [
        [config.endpoint, low, '译文1', 1],
        ['https://api.example.test/v1/chat/completions/', low, '译文1', 1],
        [config.endpoint, high, '译文2', 2],
        ['https://other.example.test/v1', high, '译文3', 3],
        [config.endpoint, low, '译文1', 3],
      ] as const) {
        expect(
          await translate(
            new OpenAiTranslator({ ...config, endpoint, profile }),
          ),
        ).toEqual({ lines: [expected], failed: [] });
        expect(fetch).toHaveBeenCalledTimes(calls);
      }
    } finally {
      pipeline.dispose();
      await pipeline.drain();
    }
  });

  it('区分协议，并把隐式和显式默认配置视为等效', () => {
    const config = {
      endpoint: 'https://api.example.test/v1',
      key: 'test-key',
      model: 'model-1',
    };
    const request = { lines: ['原文'] };
    const implicit = new OpenAiTranslator(config).getCacheKey(request);
    const explicit = new OpenAiTranslator({
      ...config,
      profile: { id: 'openai', values: { reasoning_effort: '__default__' } },
    }).getCacheKey(request);
    const responses = new OpenAiTranslator({
      ...config,
      profile: { id: 'openai-responses' },
    }).getCacheKey(request);
    expect(implicit).toBeDefined();
    expect(explicit).toBe(implicit);
    expect(responses).not.toBe(implicit);
  });

  // --- 场景 1：正常翻译与解析 ---
  it('应将统一抽象后的流式输出文本正确送入现有解析器并返回译文', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return mockStreamResponse([
        {
          choices: [{ index: 0, delta: { reasoning_content: 'internal' } }],
        },
        { choices: [{ index: 0, delta: { content: '#1:译文' } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]);
    });

    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
    });

    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).resolves.toEqual(['译文']);
    expect(requestBody).toMatchObject({
      model: 'model-1',
      stream: true,
      messages: [{ role: 'system' }, { role: 'user' }],
    });
  });

  it('自定义解析器返回行内换行时进入重试', async () => {
    vi.stubGlobal('fetch', async () =>
      mockStreamResponse([
        { choices: [{ index: 0, delta: { content: '译文' } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );
    const parseAnswer = vi
      .fn()
      .mockReturnValueOnce(['译\n文'])
      .mockReturnValue(['译文']);
    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
      promptBuilder: { build: () => [], parseAnswer },
    });
    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).resolves.toEqual(['译文']);
    expect(parseAnswer).toHaveBeenCalledTimes(2);
  });

  it('解析失败保留原始异常并归类为 lines', async () => {
    vi.stubGlobal('fetch', async () =>
      mockStreamResponse([
        { choices: [{ index: 0, delta: { content: '译文' } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );
    const error = new Error('无法解析编号');
    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
      promptBuilder: {
        build: () => [],
        parseAnswer: () => {
          throw error;
        },
      },
    });
    await expect(
      translator.translate({ lines: ['原文'], attempt: 0 }),
    ).rejects.toMatchObject({ kind: 'lines', cause: error });
  });

  it('缺少行编号重试耗尽后触发内容降级', async () => {
    const fetch = vi.fn(async () =>
      mockStreamResponse([
        { choices: [{ index: 0, delta: { content: '译文' } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
    });
    const fallback = vi
      .spyOn(translator, 'fallback')
      .mockResolvedValue(['译文']);

    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).resolves.toEqual(['译文']);
    expect(fetch).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it.each([408, 429, 500])(
    'HTTP %s 错误可重试，恢复后返回译文而不降级',
    async (status) => {
      const fetch = vi.fn(async () => {
        if (fetch.mock.calls.length === 1) {
          return new Response(
            JSON.stringify({ error: { message: 'temporary failure' } }),
            { status, headers: { 'content-type': 'application/json' } },
          );
        }
        return mockStreamResponse([
          { choices: [{ index: 0, delta: { content: '#1:译文' } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ]);
      });
      vi.stubGlobal('fetch', fetch);
      const translator = new OpenAiTranslator({
        endpoint: 'https://api.example.test',
        key: 'test-key',
        model: 'model-1',
      });
      const fallback = vi.spyOn(translator, 'fallback');

      await expect(
        attemptTranslation(translator, { lines: ['原文'] }),
      ).resolves.toEqual(['译文']);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  // --- 场景 2：服务商参数／鉴权错误直接中断 ---
  it.each([400, 401])('HTTP %s 直接抛出而不重试', async (status) => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response(
        JSON.stringify({
          error: {
            code: 'unsupported_parameter',
            message: 'unsupported effort',
          },
        }),
        {
          status,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
    });

    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).rejects.toThrow(/unsupported effort/);
    expect(calls).toBe(1);
  });
});
