import { describe, expect, it } from 'vitest';

import { createPiAiCompletion } from '../src/translator/llm-client';

const sse = (events: Array<{ event?: string; data: unknown }>) =>
  events
    .map(
      ({ event, data }) =>
        `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
    )
    .join('');

const response = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

const toHeadersRecord = (headers?: HeadersInit): Record<string, string> => {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

// ============================================================
// createPiAiCompletion 统一模型流式调用测试
// ============================================================
describe('createPiAiCompletion', () => {
  // --- 场景 1：各协议正常请求与流式解析 ---
  it('应通过 pi-ai 正确发送 OpenAI Chat 请求，并将思考过程与正文内容分离', async () => {
    let request:
      | {
          url: string;
          body: Record<string, unknown>;
          headers: Record<string, string>;
        }
      | undefined;
    const result = await createPiAiCompletion({
      protocol: 'openai-completions',
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'source' },
      ],
      requestParams: { reasoning_effort: 'low' },
      fetch: async (input, init) => {
        request = {
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          headers: toHeadersRecord(init?.headers),
        };
        return response(
          sse([
            {
              data: {
                id: 'chat-1',
                choices: [
                  { index: 0, delta: { reasoning_content: 'internal' } },
                ],
              },
            },
            {
              data: {
                id: 'chat-1',
                choices: [{ index: 0, delta: { content: '#1:译文' } }],
              },
            },
            {
              data: {
                id: 'chat-1',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              },
            },
            { data: '[DONE]' },
          ]),
        );
      },
    });

    expect(request?.url).toBe('https://api.example.test/v1/chat/completions');
    expect(request?.body).toMatchObject({
      model: 'model-1',
      stream: true,
      reasoning_effort: 'low',
    });
    expect(result).toMatchObject({
      text: '#1:译文',
      reasoning: 'internal',
      finishReason: 'stop',
    });
  });

  it('应通过 pi-ai 正确发送 OpenAI Responses 请求，并将思考摘要隔离在正文之外', async () => {
    let request: { url: string; body: Record<string, unknown> } | undefined;
    const result = await createPiAiCompletion({
      protocol: 'openai-responses',
      endpoint: 'https://api.example.test/v1',
      key: 'test-key',
      model: 'model-1',
      messages: [{ role: 'user', content: 'source' }],
      requestParams: { reasoning: { effort: 'high' } },
      fetch: async (input, init) => {
        request = {
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        };
        return response(
          sse([
            {
              event: 'response.output_item.added',
              data: {
                type: 'response.output_item.added',
                output_index: 0,
                item: {
                  type: 'reasoning',
                  id: 'reasoning-1',
                  summary: [],
                },
              },
            },
            {
              event: 'response.reasoning_summary_text.delta',
              data: {
                type: 'response.reasoning_summary_text.delta',
                output_index: 0,
                summary_index: 0,
                delta: 'internal',
              },
            },
            {
              event: 'response.output_item.done',
              data: {
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                  type: 'reasoning',
                  id: 'reasoning-1',
                  summary: [{ type: 'summary_text', text: 'internal' }],
                },
              },
            },
            {
              event: 'response.output_item.added',
              data: {
                type: 'response.output_item.added',
                output_index: 1,
                item: { type: 'message', role: 'assistant', content: [] },
              },
            },
            {
              event: 'response.output_text.delta',
              data: {
                type: 'response.output_text.delta',
                output_index: 1,
                content_index: 0,
                delta: '#1:译文',
              },
            },
            {
              event: 'response.output_item.done',
              data: {
                type: 'response.output_item.done',
                output_index: 1,
                item: {
                  type: 'message',
                  id: 'message-1',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '#1:译文' }],
                },
              },
            },
            {
              event: 'response.completed',
              data: {
                type: 'response.completed',
                response: {
                  id: 'response-1',
                  status: 'completed',
                  output: [
                    {
                      type: 'reasoning',
                      summary: [{ type: 'summary_text', text: 'internal' }],
                    },
                    {
                      type: 'message',
                      role: 'assistant',
                      content: [{ type: 'output_text', text: '#1:译文' }],
                    },
                  ],
                },
              },
            },
          ]),
        );
      },
    });

    expect(request?.url).toBe('https://api.example.test/v1/responses');
    expect(request?.body).toMatchObject({
      model: 'model-1',
      stream: true,
      store: false,
      reasoning: { effort: 'high' },
    });
    expect(result.text).toBe('#1:译文');
    expect(result.text).not.toContain('internal');
  });

  it('应将系统提示词提取到 Anthropic 顶层 system 字段，并正确解析 text 和 thinking 块', async () => {
    let request:
      | {
          url: string;
          body: Record<string, unknown>;
          headers: Record<string, string>;
        }
      | undefined;
    const result = await createPiAiCompletion({
      protocol: 'anthropic-messages',
      endpoint: 'https://anthropic.example.test/v1',
      key: 'test-key',
      model: 'claude-test',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'source' },
      ],
      requestParams: {
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
      },
      fetch: async (input, init) => {
        request = {
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          headers: toHeadersRecord(init?.headers),
        };
        return response(
          sse([
            {
              event: 'message_start',
              data: {
                type: 'message_start',
                message: {
                  id: 'msg-1',
                  type: 'message',
                  role: 'assistant',
                  content: [],
                  model: 'claude-test',
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 0 },
                },
              },
            },
            {
              event: 'content_block_start',
              data: {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'thinking', thinking: '' },
              },
            },
            {
              event: 'content_block_delta',
              data: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'thinking_delta', thinking: 'internal' },
              },
            },
            {
              event: 'content_block_stop',
              data: { type: 'content_block_stop', index: 0 },
            },
            {
              event: 'content_block_start',
              data: {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'text', text: '' },
              },
            },
            {
              event: 'content_block_delta',
              data: {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'text_delta', text: '#1:译文' },
              },
            },
            {
              event: 'content_block_stop',
              data: { type: 'content_block_stop', index: 1 },
            },
            {
              event: 'message_delta',
              data: {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
              },
            },
            { event: 'message_stop', data: { type: 'message_stop' } },
          ]),
        );
      },
    });

    expect(request?.url).toMatch(
      /^https:\/\/anthropic\.example\.test\/v1\/messages\?beta=true$/,
    );
    expect(request?.body).toMatchObject({
      system: [{ text: 'system' }],
      max_tokens: expect.any(Number),
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
    expect(request?.body.messages).toEqual([
      { role: 'user', content: 'source' },
    ]);
    expect(request?.headers).toMatchObject({
      'anthropic-version': expect.any(String),
      'x-api-key': 'test-key',
    });
    expect(result).toMatchObject({
      text: '#1:译文',
      reasoning: 'internal',
      finishReason: 'stop',
    });
  });

  it('网络失败保留 fetch 原始异常并归类为可重试请求错误', async () => {
    const error = new TypeError('fetch failed');
    await expect(
      createPiAiCompletion({
        protocol: 'openai-completions',
        endpoint: 'https://api.example.test',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () => {
          throw error;
        },
      }),
    ).rejects.toMatchObject({
      kind: 'request',
      cause: { name: 'PiAiRequestError', status: undefined, cause: error },
    });
  });

  // --- 场景 2：服务商错误与流异常处理 ---
  it('当服务商返回参数错误时，应直接抛出异常且不进行重试', async () => {
    let calls = 0;
    await expect(
      createPiAiCompletion({
        protocol: 'openai-completions',
        endpoint: 'https://api.example.test',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () => {
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
        },
      }),
    ).rejects.toThrow(/unsupported effort/);
    expect(calls).toBe(1);
  });

  it('当 Anthropic 消息流中途返回 error 事件时，应抛出异常而不是返回残缺文本', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'anthropic-messages',
        endpoint: 'https://anthropic.example.test/v1/messages',
        key: 'test-key',
        model: 'claude-test',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'message_start',
                data: {
                  type: 'message_start',
                  message: {
                    id: 'msg-1',
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: 'claude-test',
                    stop_reason: null,
                    usage: { input_tokens: 1, output_tokens: 0 },
                  },
                },
              },
              {
                event: 'content_block_start',
                data: {
                  type: 'content_block_start',
                  index: 0,
                  content_block: { type: 'text', text: '' },
                },
              },
              {
                event: 'content_block_delta',
                data: {
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: '#1:部分译文' },
                },
              },
              {
                event: 'error',
                data: {
                  type: 'error',
                  error: {
                    type: 'overloaded_error',
                    message: 'provider overloaded',
                  },
                },
              },
            ]),
          ),
      }),
    ).rejects.toThrow(/overloaded_error.*provider overloaded/);
  });

  it('当 OpenAI Responses 收到 response.failed 时，应抛出异常而不是返回残缺文本', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'openai-responses',
        endpoint: 'https://api.example.test/v1/responses',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'response.output_item.added',
                data: {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { type: 'message', role: 'assistant', content: [] },
                },
              },
              {
                event: 'response.output_text.delta',
                data: {
                  type: 'response.output_text.delta',
                  output_index: 0,
                  content_index: 0,
                  delta: '#1:部分译文',
                },
              },
              {
                event: 'response.failed',
                data: {
                  type: 'response.failed',
                  response: {
                    id: 'response-1',
                    status: 'failed',
                    error: {
                      code: 'server_error',
                      message: 'provider failed',
                    },
                  },
                },
              },
            ]),
          ),
      }),
    ).rejects.toMatchObject({
      kind: 'request',
      cause: {
        name: 'PiAiRequestError',
        status: 200,
        message: expect.stringMatching(/server_error.*provider failed/),
      },
    });
  });

  it('当 OpenAI Responses 流式响应缺少终态事件时，应抛出异常拒绝结果', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'openai-responses',
        endpoint: 'https://api.example.test/v1',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'response.output_item.added',
                data: {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { type: 'message', role: 'assistant', content: [] },
                },
              },
              {
                event: 'response.output_text.delta',
                data: {
                  type: 'response.output_text.delta',
                  output_index: 0,
                  content_index: 0,
                  delta: '#1:部分译文',
                },
              },
            ]),
          ),
      }),
    ).rejects.toThrow(/terminal response event/);
  });

  it('当 Anthropic 流在 message_stop 之前提前中断时，应抛出异常拒绝结果', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'anthropic-messages',
        endpoint: 'https://anthropic.example.test/v1',
        key: 'test-key',
        model: 'claude-test',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'message_start',
                data: {
                  type: 'message_start',
                  message: {
                    id: 'msg-1',
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: 'claude-test',
                    stop_reason: null,
                    usage: { input_tokens: 1, output_tokens: 0 },
                  },
                },
              },
            ]),
          ),
      }),
    ).rejects.toThrow(/message_stop/);
  });

  it('当 Responses 返回 incomplete (token 截断) 时，应准确提示并拒绝结果', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'openai-responses',
        endpoint: 'https://api.example.test/v1',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'response.incomplete',
                data: {
                  type: 'response.incomplete',
                  response: {
                    id: 'response-1',
                    status: 'incomplete',
                    incomplete_details: { reason: 'max_output_tokens' },
                    output: [],
                  },
                },
              },
            ]),
          ),
      }),
    ).rejects.toMatchObject({
      kind: 'degraded',
      message: expect.stringMatching(/输出被截断/),
      cause: { name: 'PiAiRequestError', status: 200 },
    });
  });

  it('当响应已完成但翻译正文内容为空时，应抛出异常', async () => {
    await expect(
      createPiAiCompletion({
        protocol: 'openai-responses',
        endpoint: 'https://api.example.test/v1',
        key: 'test-key',
        model: 'model-1',
        messages: [{ role: 'user', content: 'source' }],
        fetch: async () =>
          response(
            sse([
              {
                event: 'response.completed',
                data: {
                  type: 'response.completed',
                  response: {
                    id: 'response-1',
                    status: 'completed',
                    output: [],
                  },
                },
              },
            ]),
          ),
      }),
    ).rejects.toMatchObject({ kind: 'lines', message: '响应正文为空' });
  });

  // --- 场景 3：请求生命周期与取消控制 ---
  it('应正确将 AbortSignal 传递到底层请求并在取消时抛出 AbortError', async () => {
    const controller = new AbortController();
    let fetchStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    const request = createPiAiCompletion({
      protocol: 'openai-completions',
      endpoint: 'https://api.example.test',
      key: 'test-key',
      model: 'model-1',
      messages: [{ role: 'user', content: 'source' }],
      signal: controller.signal,
      fetch: async (_input, init): Promise<Response> => {
        fetchStarted();
        expect(init?.signal).toBeDefined();
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    });
    await started;
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
