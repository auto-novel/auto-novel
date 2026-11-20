import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAiTranslator } from '../src/translator/llm';
import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';

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
