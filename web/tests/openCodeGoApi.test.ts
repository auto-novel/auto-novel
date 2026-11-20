import { afterEach, expect, it, vi } from 'vite-plus/test';
import ky from 'ky';
import { createTranslator } from '@auto-novel/translator';
import {
  toTranslatorConfig,
  type GptPipelineWorker,
} from '../src/model/Translator';

const post = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({ client: { post } }));
afterEach(() => post.mockReset());

const endpoint = 'https://opencode.ai/inference/go/openai/v1';
const worker: GptPipelineWorker = {
  id: 'Go',
  model: 'deepseek-v4.1-flash',
  key: 'test-go-key',
  concurrency: 1,
  endpoint,
  profile: { id: 'openai', values: { reasoning_effort: 'high' } },
};
const config = (changes: Partial<GptPipelineWorker>) =>
  toTranslatorConfig('gpt', { ...worker, ...changes });

it('只有用户开启中转并使用官方 Chat Completions 地址时才转发', () => {
  expect(config({})).not.toHaveProperty('fetch');
  expect(config({ relayOpenCodeGo: false })).not.toHaveProperty('fetch');
  expect(
    config({ relayOpenCodeGo: true, profile: { id: 'openai-responses' } }),
  ).not.toHaveProperty('fetch');
  for (const address of [
    endpoint,
    endpoint + '/chat/completions',
    'https://opencode.ai/zen/go/v1',
  ]) {
    expect(config({ relayOpenCodeGo: true, endpoint: address })).toHaveProperty(
      'fetch',
    );
  }
  for (const address of [
    'https://opencode.ai.evil.test/inference/go/openai/v1',
    'https://opencode.ai/inference/openai/v1',
    'http://opencode.ai/inference/go/openai/v1',
    endpoint + '?key=x',
    endpoint + '#fragment',
    'https://user:pass@opencode.ai/inference/go/openai/v1',
  ]) {
    expect(
      config({ relayOpenCodeGo: true, endpoint: address }),
    ).not.toHaveProperty('fetch');
  }
});

it('翻译和逐行降级使用本站客户端、原提示词及同一个 OpenCode 会话', async () => {
  const sessions: string[] = [];
  post.mockImplementation(async (path, options) => {
    expect(path).toBe('translator/opencode-go/chat/completions');
    expect(options).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-opencode-key': worker.key,
        'x-opencode-session': expect.stringMatching(/^[a-f0-9-]{36}$/),
      },
    });
    expect(options.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(options.body)).toMatchObject({
      model: worker.model,
      reasoning_effort: 'high',
      stream: true,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user' }),
      ]),
    });
    sessions.push(options.headers['x-opencode-session']);
    return new Response(
      'data: {"choices":[{"index":0,"delta":{"content":"#1:早上好。"}}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const translator = await createTranslator(config({ relayOpenCodeGo: true }));
  const request = { lines: ['おはようございます。'], attempt: 0 };
  expect(await translator.translate(request)).toEqual(['早上好。']);
  expect(await translator.fallback!(request)).toEqual(['早上好。']);
  expect(sessions).toHaveLength(2);
  expect(sessions[0]).toEqual(sessions[1]);
});

it('返回上游的限流状态、错误正文和重试时间', async () => {
  const { fetch } = config({ relayOpenCodeGo: true }) as {
    fetch: typeof globalThis.fetch;
  };
  post.mockImplementation((_path, options) =>
    ky.post('https://site.test/api/translator/opencode-go/chat/completions', {
      ...options,
      retry: 0,
      fetch: async () =>
        new Response('{"error":{"message":"rate limited"}}', {
          status: 429,
          headers: { 'retry-after': '30' },
        }),
    }),
  );
  const init = {
    method: 'POST',
    body: '{}',
    headers: {
      authorization: 'Bearer test-go-key',
      'x-opencode-session': 'session-test',
    },
  };
  const response = await fetch(endpoint + '/chat/completions', init);
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('30');
  expect(await response.json()).toEqual({ error: { message: 'rate limited' } });
  await expect(
    fetch(endpoint, { ...init, signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(post).toHaveBeenCalledTimes(1);
});
