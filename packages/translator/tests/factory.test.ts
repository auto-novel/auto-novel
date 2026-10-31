import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/factory';
import { OpenAiTranslator } from '../src/translator/llm';
import { SakuraTranslator } from '../src/translator/sakura';

const sakuraMeta = {
  vocab_type: 2,
  n_vocab: 152064,
  n_ctx_train: 131072,
  n_embd: 5120,
  n_params: 14770033664,
  size: 8180228096,
};

const stubModels = (id: string, meta: Record<string, number> = sakuraMeta) =>
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id, object: 'model', created: 0, owned_by: 'x', meta }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

describe('createTranslator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('openai 类型直接返回实例', async () => {
    const translator = await createTranslator({
      kind: 'openai',
      endpoint: 'https://api.example.test',
      key: 'k',
      model: 'm',
    });
    expect(translator).toBeInstanceOf(OpenAiTranslator);
    expect(translator.probe).toBeUndefined();
  });

  it('sakura 类型探测模型并给出审批结果', async () => {
    stubModels('sakura-14b-qwen2.5-v1.0-iq4xs.gguf');
    const translator = await createTranslator({
      kind: 'sakura',
      endpoint: 'http://127.0.0.1:8080',
    });
    expect(translator).toBeInstanceOf(SakuraTranslator);
    await expect(translator.probe?.()).resolves.toMatchObject({
      approved: true,
      info: { model: 'sakura-14b-qwen2.5-v1.0-iq4xs' },
    });
  });

  it('模型元数据不一致时拒绝上传但保留信息', async () => {
    stubModels('sakura-14b-qwen2.5-v1.0-iq4xs', {
      ...sakuraMeta,
      n_ctx_train: 4096,
    });
    const translator = await createTranslator({
      kind: 'sakura',
      endpoint: 'http://127.0.0.1:8080',
    });
    const probe = await translator.probe?.();
    expect(probe?.approved).toBe(false);
    expect(probe?.reason).toContain('模型检查未通过');
    expect(probe?.info?.model).toBe('sakura-14b-qwen2.5-v1.0-iq4xs');
  });

  it('未登记的模型直接拒绝', async () => {
    stubModels('some-other-model');
    const translator = await createTranslator({
      kind: 'sakura',
      endpoint: 'http://127.0.0.1:8080',
    });
    const probe = await translator.probe?.();
    expect(probe?.approved).toBe(false);
    expect(probe?.reason).toContain('禁止上传');
  });
});
