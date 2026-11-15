import { afterEach, describe, expect, it, vi } from 'vitest';
import ky from 'ky';

import { createOpenCodeGoFetch } from '../src/api/OpenCodeGoApi';
import { toTranslatorConfig } from '../src/model/Translator';
import {
  createTranslator,
  OPEN_CODE_GO_ENDPOINT,
} from '@auto-novel/translator';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../src/api/client', () => ({ client: { post: mocks.post } }));

const url = `${OPEN_CODE_GO_ENDPOINT}/chat/completions`;
const body = JSON.stringify({
  model: 'deepseek-v4.1-flash',
  messages: [{ role: 'user', content: 'source' }],
  stream: true,
});
const init = {
  method: 'POST',
  headers: {
    authorization: 'Bearer go-test-key',
    'content-type': 'application/json',
    'x-unrelated': 'do not forward',
  },
  body,
};

afterEach(() => {
  vi.restoreAllMocks();
  mocks.post.mockReset();
});

describe('OpenCode Go native relay', () => {
  it('工作区配置通过原翻译器、原提示词和 SDK 完成同源转发', async () => {
    mocks.post.mockImplementation(async (_path, options) => {
      expect(JSON.parse(options.body)).toMatchObject({
        model: 'deepseek-v4.1-flash',
        reasoning_effort: 'high',
        stream: true,
      });
      expect(options.headers['x-opencode-key']).toBe('go-test-key');
      return new Response(
        [
          { choices: [{ index: 0, delta: { content: '#1:这是译文。' } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
          '[DONE]',
        ]
          .map(
            (event) =>
              `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`,
          )
          .join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    const translator = await createTranslator(
      toTranslatorConfig('gpt', {
        id: 'Go',
        endpoint: OPEN_CODE_GO_ENDPOINT,
        model: 'deepseek-v4.1-flash',
        key: 'go-test-key',
        concurrency: 48,
        profile: { id: 'opencode-go', values: { reasoning_effort: 'high' } },
      }),
    );
    expect(
      await translator.translate({ lines: ['これは原文です。'], attempt: 0 }),
    ).toEqual(['这是译文。']);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('只通过本站客户端发送 Go Key、稳定会话和原始正文，逐字返回 SSE', async () => {
    const response = new Response('data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    mocks.post.mockResolvedValue(response);
    const transport = createOpenCodeGoFetch();
    expect(await transport(url, init)).toBe(response);
    await transport(new Request(url, init));
    const otherTransport = createOpenCodeGoFetch();
    await otherTransport(url, init);
    expect(mocks.post).toHaveBeenCalledTimes(3);
    const [path, options] = mocks.post.mock.calls[0];
    expect(path).toBe('translator/opencode-go/chat/completions');
    expect(options).toMatchObject({
      body,
      redirect: 'error',
      timeout: false,
      headers: {
        'content-type': 'application/json',
        'x-opencode-key': 'go-test-key',
      },
    });
    expect(Object.keys(options.headers)).toEqual([
      'content-type',
      'x-opencode-key',
      'x-opencode-session',
    ]);
    const session = options.headers['x-opencode-session'];
    expect(session).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.post.mock.calls[1][1].headers['x-opencode-session']).toBe(
      session,
    );
    expect(mocks.post.mock.calls[2][1].headers['x-opencode-session']).not.toBe(
      session,
    );
  });

  it('其他服务商和自定义网关沿用 fetch，不经过本站或附加 Go 信息', async () => {
    const direct = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response());
    const transport = createOpenCodeGoFetch();
    for (const endpoint of [
      'https://api.deepseek.com/v1/chat/completions',
      'http://localhost:8080/v1/chat/completions',
      'https://opencode.ai/inference/openai/v1/chat/completions',
    ]) {
      await transport(endpoint, init);
      expect(direct).toHaveBeenLastCalledWith(endpoint, init);
    }
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('服务商错误状态和正文仍交给翻译器，网络错误保持原异常', async () => {
    const response = new Response('{"error":{"message":"rate limited"}}', {
      status: 429,
      headers: { 'retry-after': '30' },
    });
    mocks.post.mockImplementationOnce((_path, options) =>
      ky.post('https://site.test/api/translator/opencode-go/chat/completions', {
        ...options,
        retry: 0,
        fetch: async () => response,
      }),
    );
    const result = await createOpenCodeGoFetch()(url, init);
    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBe('30');
    expect(await result.text()).toContain('rate limited');
    const networkError = new TypeError('offline');
    mocks.post.mockRejectedValueOnce(networkError);
    await expect(createOpenCodeGoFetch()(url, init)).rejects.toBe(networkError);
  });

  it('运行中取消会传给同源请求；已取消和缺少 Key 的请求不发送', async () => {
    const controller = new AbortController();
    mocks.post.mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(options.signal.reason),
          );
          controller.abort();
        }),
    );
    await expect(
      createOpenCodeGoFetch()(url, { ...init, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await expect(
      createOpenCodeGoFetch()(url, { ...init, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      createOpenCodeGoFetch()(url, { ...init, headers: {} }),
    ).rejects.toThrow(/Key/);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});
