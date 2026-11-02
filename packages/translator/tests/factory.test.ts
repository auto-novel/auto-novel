import ky from 'ky';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/factory';
import { OpenAiTranslator } from '../src/translator/llm';
import { SakuraTranslator } from '../src/translator/sakura';
import { YoudaoTranslator } from '../src/translator/youdao';

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
    const log = vi.fn();
    const translator = await createTranslator({
      kind: 'openai',
      endpoint: 'https://api.example.test',
      key: 'k',
      model: 'm',
      log,
    });
    expect(translator).toBeInstanceOf(OpenAiTranslator);
    expect(translator.log).toBe(log);
    expect(translator.probe).toBeUndefined();
  });

  it('youdao 类型透传 client/log 并等待初始化完成', async () => {
    let finishInit!: (response: Response) => void;
    const keyResponse = new Promise<Response>((resolve) => {
      finishInit = resolve;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response())
      .mockReturnValueOnce(keyResponse);
    const client = ky.create({ fetch });
    const log = vi.fn();
    let resolved = false;
    const pending = createTranslator({ kind: 'youdao', client, log }).then(
      (translator) => {
        resolved = true;
        return translator;
      },
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(resolved).toBe(false);
    finishInit(Response.json({ data: { secretKey: 'test-key' } }));

    const translator = await pending;
    expect(translator).toBeInstanceOf(YoudaoTranslator);
    expect(translator.log).toBe(log);
  });

  it('sakura 类型探测模型并给出审批结果', async () => {
    stubModels('sakura-14b-qwen2.5-v1.0-iq4xs.gguf');
    const log = vi.fn();
    const translator = await createTranslator({
      kind: 'sakura',
      endpoint: 'http://127.0.0.1:8080',
      log,
    });
    expect(translator).toBeInstanceOf(SakuraTranslator);
    expect(translator.log).toBe(log);
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
