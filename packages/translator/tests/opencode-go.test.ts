import { describe, expect, it } from 'vitest';

import { OpenAiTranslator } from '../src/translator/llm';
import { resolveOpenAiProfile } from '../src/translator/llm-profiles';
import {
  isOpenCodeGoEndpoint,
  OPEN_CODE_GO_ENDPOINT,
} from '../src/translator/opencode-go';

describe('OpenCode Go', () => {
  it('使用 Chat Completions 协议，默认不强制模型思考参数', () => {
    expect(resolveOpenAiProfile({ id: 'opencode-go' })).toEqual({
      protocol: 'openai-completions',
      requestParams: {},
      reasoningEffort: '默认',
    });
    expect(
      resolveOpenAiProfile({
        id: 'opencode-go',
        values: { reasoning_effort: 'high' },
      }).requestParams,
    ).toEqual({ reasoning_effort: 'high' });
  });

  it('只识别官方 Go Chat 地址及旧版别名', () => {
    for (const endpoint of [
      OPEN_CODE_GO_ENDPOINT,
      `${OPEN_CODE_GO_ENDPOINT}/chat/completions`,
      'https://opencode.ai/inference/go/v1/',
      'https://opencode.ai/zen/go/v1/chat/completions/',
    ]) {
      expect(isOpenCodeGoEndpoint(endpoint), endpoint).toBe(true);
    }
    for (const endpoint of [
      'https://opencode.ai/inference/openai/v1',
      'http://opencode.ai/inference/go/openai/v1',
      'https://opencode.ai.evil.test/inference/go/openai/v1',
      'https://opencode.ai:8443/inference/go/openai/v1',
      `${OPEN_CODE_GO_ENDPOINT}/responses`,
      `${OPEN_CODE_GO_ENDPOINT}?url=https://evil.test`,
      `${OPEN_CODE_GO_ENDPOINT}#fragment`,
      'https://user:password@opencode.ai/inference/go/openai/v1',
      'not a URL',
    ]) {
      expect(isOpenCodeGoEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it('翻译和逐行降级都使用宿主传输，并保留模型与参数', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const translator = new OpenAiTranslator({
      endpoint: OPEN_CODE_GO_ENDPOINT,
      key: 'go-test-key',
      model: 'deepseek-v4.1-flash',
      profile: { id: 'opencode-go', values: { reasoning_effort: 'high' } },
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          'data: ' +
            JSON.stringify({
              id: 'chat-1',
              choices: [{ index: 0, delta: { content: '#1:这是译文。' } }],
            }) +
            '\n\ndata: ' +
            JSON.stringify({
              id: 'chat-1',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            }) +
            '\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      },
    });
    const request = { lines: ['これは原文です。'], attempt: 0 };
    expect(await translator.translate(request)).toEqual(['这是译文。']);
    expect(await translator.fallback(request)).toEqual(['这是译文。']);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe(`${OPEN_CODE_GO_ENDPOINT}/chat/completions`);
      expect(request.body).toMatchObject({
        model: 'deepseek-v4.1-flash',
        reasoning_effort: 'high',
        stream: true,
      });
    }
  });
});
