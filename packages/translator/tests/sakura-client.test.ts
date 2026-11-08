import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAiApi } from '../src/translator/sakura-client';
import { SakuraTranslator } from '../src/translator/sakura';
import { attemptTranslation } from '../src/pipeline/attempt';

describe('Sakura API 错误详情', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [
      '嵌套错误',
      { error: { message: 'CUDA out of memory' } },
      'CUDA out of memory',
    ],
    ['顶层消息', { message: '模型加载失败' }, '模型加载失败'],
    ['detail', { detail: '上下文长度超限' }, '上下文长度超限'],
    ['未知 JSON', { reason: 'busy' }, '{"reason":"busy"}'],
    ['纯文本', 'upstream unavailable', 'upstream unavailable'],
    ['空响应', '', ''],
  ])('%s 同时用于模型探测和翻译请求', async (_name, body, detail) => {
    vi.stubGlobal('fetch', async () =>
      typeof body === 'string'
        ? new Response(body, { status: 500 })
        : Response.json(body, { status: 500 }),
    );
    const api = createOpenAiApi('https://example.test', 'no-key');
    for (const request of [
      () => api.listModels(),
      () => api.createChatCompletions({ model: '', messages: [] }),
    ]) {
      await expect(request()).rejects.toMatchObject({
        name: 'HTTPError',
        message: detail
          ? expect.stringContaining(`服务端错误：${detail}`)
          : expect.not.stringContaining('服务端错误'),
        response: expect.objectContaining({ status: 500 }),
      });
    }
  });

  it('长错误截断，避免撑满工作区日志', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('x'.repeat(3000), { status: 500 }),
    );
    await expect(
      createOpenAiApi('https://example.test', 'no-key').listModels(),
    ).rejects.toThrow(`服务端错误：${'x'.repeat(2000)}…`);
  });

  it('Sakura 日志及重试后的最终错误均保留服务端原因', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: 'CUDA out of memory' } },
        { status: 500 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const log = vi.fn();
    const translator = await SakuraTranslator.create({
      endpoint: 'https://example.test',
      log,
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('获取模型数据失败：HTTPError:'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('服务端错误：CUDA out of memory'),
    );
    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/重试次数过多.*500.*CUDA out of memory/),
      cause: expect.objectContaining({ kind: 'request' }),
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
