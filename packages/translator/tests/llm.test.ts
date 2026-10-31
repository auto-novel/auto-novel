import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAiTranslator } from '../src/translator/llm';
import { attemptTranslation } from '../src/pipeline/attempt';

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

  // --- 场景 2：服务商参数错误直接中断 ---
  it('当遇到服务商返回参数错误时，应直接向外抛出而不进行重试', async () => {
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
          status: 400,
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

  // --- 场景 3：Responses 流式失败直接中断 ---
  it('当 OpenAI Responses 流式响应失败时，应直接抛给调用方而不触发重试', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response(
        [
          'event: response.output_item.added',
          'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[]}}',
          '',
          'event: response.failed',
          'data: {"type":"response.failed","response":{"status":"failed","error":{"code":"provider_error","message":"stream failed"}}}',
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });

    const translator = new OpenAiTranslator({
      endpoint: 'https://api.example.test/v1',
      key: 'test-key',
      model: 'model-1',
      profile: { id: 'openai-responses', values: {} },
    });

    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).rejects.toThrow(/provider_error.*stream failed/);
    expect(calls).toBe(1);
  });
});
