import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import { OpenAiTranslator } from '../src/translator/llm';
import {
  createOpenAiPromptBuilder,
  PartialGptAnswer,
} from '../src/translator/llm-prompt';

const config = {
  endpoint: 'https://api.example.test',
  key: 'test-key',
  model: 'model-1',
};

const completion = (text: string) =>
  new Response(
    [
      { choices: [{ index: 0, delta: { content: text } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );

function mockAnswers(answers: Array<string | Response>) {
  const requests: string[][] = [];
  const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(
      body.messages
        .at(-1)
        .content.split('\n')
        .filter((line: string) => /^#\d+:/.test(line)),
    );
    const answer = answers.shift();
    if (answer === undefined) throw new Error('出现预算外请求');
    return typeof answer === 'string' ? completion(answer) : answer;
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe('GPT 失败行修复', () => {
  it('保留有效行，缺行重试只请求缺失原文并恢复原顺序', async () => {
    const { requests } = mockAnswers([
      '#3:第三译文\n#1:第一译文',
      '#1:第二译文',
    ]);
    const lines = Object.freeze(['一番目', '二番目', '三番目', 'FIN']);
    expect(
      await attemptTranslation(new OpenAiTranslator(config), { lines }),
    ).toEqual(['第一译文', '第二译文', '第三译文', 'FIN']);
    expect(requests).toEqual([
      ['#1:一番目', '#2:二番目', '#3:三番目'],
      ['#1:二番目'],
    ]);
  });

  it.each([
    '#1:甲译文\n#2:乙译文\n#2:重复译文\n#3:丙译文',
    '#1:甲译文\n#2:乙译文\n额外续行\n#3:丙译文',
  ])('重复编号或额外续行只让对应行失效', (answer) => {
    const parse = createOpenAiPromptBuilder().parseAnswer;
    try {
      parse(answer, ['甲', '乙', '丙']);
      throw new Error('应拒绝不完整输出');
    } catch (error) {
      expect(error).toBeInstanceOf(PartialGptAnswer);
      expect((error as PartialGptAnswer).lines).toEqual([
        '甲译文',
        undefined,
        '丙译文',
      ]);
    }
  });

  it('乱序编号和代码围栏仍能正确还原', () => {
    expect(
      createOpenAiPromptBuilder().parseAnswer(
        '```text\n#2:乙译文\n#1:甲译文\n```',
        ['甲', '乙'],
      ),
    ).toEqual(['甲译文', '乙译文']);
  });

  it('某行丢失保护标记后只修复该行', async () => {
    const requests: string[][] = [];
    vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const prompt = body.messages.at(-1).content as string;
      requests.push(prompt.split('\n').filter((line) => /^#\d+:/.test(line)));
      if (requests.length === 1) return completion('#1:完整译文\n#2:链接丢了');
      const token = requests[1][0].match(/__AN_KEEP_\d+__/)![0];
      return completion(`#1:请参考 ${token}`);
    });
    expect(
      await attemptTranslation(new OpenAiTranslator(config), {
        lines: ['一番目', '詳しくは https://example.test を参照'],
      }),
    ).toEqual(['完整译文', '请参考 https://example.test']);
    expect(requests.map((lines) => lines.length)).toEqual([2, 1]);
  });

  it('语言失败和空译文按行修复，不重发其他有效译文', async () => {
    const { requests } = mockAnswers([
      '#1:有效译文\n#2:日本語です\n#3:',
      '#1:第二译文\n#2:第三译文',
    ]);
    expect(
      await attemptTranslation(new OpenAiTranslator(config), {
        lines: ['一番目', '二番目', '三番目'],
      }),
    ).toEqual(['有效译文', '第二译文', '第三译文']);
    expect(requests[1]).toEqual(['#1:二番目', '#2:三番目']);
  });

  it('三次尝试后只逐行降级剩余失败行', async () => {
    const { requests, fetch } = mockAnswers([
      '#1:第一译文',
      '#1:第二译文',
      '缺少编号',
      '#1:第三译文',
    ]);
    const translator = new OpenAiTranslator(config);
    const fallback = vi.spyOn(translator, 'fallback');
    expect(
      await attemptTranslation(translator, {
        lines: ['一番目', '二番目', '三番目'],
      }),
    ).toEqual(['第一译文', '第二译文', '第三译文']);
    expect(fetch).toHaveBeenCalledTimes(TRANSLATION_RETRIES + 1);
    expect(fallback).toHaveBeenCalledOnce();
    expect(requests).toEqual([
      ['#1:一番目', '#2:二番目', '#3:三番目'],
      ['#1:二番目', '#2:三番目'],
      ['#1:三番目'],
      ['#1:三番目'],
    ]);
  });

  it.each([429, 500])(
    'HTTP %s 后继续复用已通过的行，仍遵守三次预算',
    async (status) => {
      const { requests, fetch } = mockAnswers([
        '#1:第一译文',
        new Response(
          JSON.stringify({ error: { message: 'temporary failure' } }),
          { status, headers: { 'content-type': 'application/json' } },
        ),
        '#1:第二译文',
      ]);
      const translator = new OpenAiTranslator(config);
      const fallback = vi.spyOn(translator, 'fallback');
      expect(
        await attemptTranslation(translator, { lines: ['一番目', '二番目'] }),
      ).toEqual(['第一译文', '第二译文']);
      expect(fetch).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
      expect(requests.slice(1)).toEqual([['#1:二番目'], ['#1:二番目']]);
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it('鉴权失败直接退出并清除部分结果', async () => {
    const { requests, fetch } = mockAnswers([
      '#1:旧译文',
      new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
      '#1:新译文\n#2:第二译文',
    ]);
    const translator = new OpenAiTranslator(config);
    const fallback = vi.spyOn(translator, 'fallback');
    const lines = ['一番目', '二番目'];
    await expect(attemptTranslation(translator, { lines })).rejects.toThrow(
      /invalid key/,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
    expect(await translator.translate({ lines, attempt: 2 })).toEqual([
      '新译文',
      '第二译文',
    ]);
    expect(requests[2]).toHaveLength(2);
  });

  it('新一次任务从零开始，不沿用旧的部分结果', async () => {
    const { requests } = mockAnswers(['#1:旧译文', '#1:新译文\n#2:第二译文']);
    const translator = new OpenAiTranslator(config);
    const lines = ['一番目', '二番目'];
    await expect(
      translator.translate({ lines, attempt: 0 }),
    ).rejects.toMatchObject({ kind: 'lines' });
    expect(await translator.translate({ lines, attempt: 0 })).toEqual([
      '新译文',
      '第二译文',
    ]);
    expect(requests[1]).toHaveLength(2);
  });

  it('修复请求带原始前文并丢弃未对齐的历史，不修改调用方上下文', async () => {
    const context = Object.freeze({
      previousSource: '更早的前文',
      history: Object.freeze({
        lines: ['一番目', '二番目'],
        translatedLines: ['旧译甲', '旧译乙'],
        glossary: {},
      }),
    });
    const build = vi.fn(createOpenAiPromptBuilder().build);
    const translator = new OpenAiTranslator({
      ...config,
      promptBuilder: { ...createOpenAiPromptBuilder(), build },
    });
    mockAnswers(['#1:第一译文', '#1:第二译文']);
    await attemptTranslation(translator, {
      lines: context.history.lines,
      context,
    });
    expect(build.mock.calls[1][1]).toMatchObject({
      previousSource: '更早的前文\n一番目',
      expired: true,
    });
    expect(build.mock.calls[1][1]?.history).toBeUndefined();
    expect(context.history.translatedLines).toEqual(['旧译甲', '旧译乙']);
  });

  it('上下文或取消信号变更后不复用部分结果', async () => {
    const { requests } = mockAnswers([
      '#1:旧译文',
      '#1:新译文\n#2:第二译文',
      '#1:旧译文',
      '#1:新译文\n#2:第二译文',
    ]);
    const translator = new OpenAiTranslator(config);
    const lines = ['一番目', '二番目'];
    await expect(
      translator.translate({ lines, attempt: 0, context: { glossary: {} } }),
    ).rejects.toThrow();
    await translator.translate({
      lines,
      attempt: 1,
      context: { glossary: {} },
    });
    await expect(
      translator.translate({
        lines,
        attempt: 0,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    await translator.translate({
      lines,
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(requests.map((lines) => lines.length)).toEqual([2, 2, 2, 2]);
  });

  it('并行借用同一数组时禁用部分复用，避免不同任务串用译文', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)).messages.at(-1).content);
      await gate;
      return completion('#1:译文甲\n#2:译文乙');
    });
    const parseAnswer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new PartialGptAnswer(['任务甲译文', undefined]);
      })
      .mockImplementationOnce(() => {
        throw new PartialGptAnswer([undefined, '任务乙译文']);
      })
      .mockReturnValue(['新译甲', '新译乙']);
    const translator = new OpenAiTranslator({
      ...config,
      promptBuilder: { ...createOpenAiPromptBuilder(), parseAnswer },
    });
    const lines = ['一番目', '二番目'];
    const first = translator.translate({ lines, attempt: 0 });
    const second = translator.translate({ lines, attempt: 0 });
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    release();
    expect((await settled).map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(parseAnswer).toHaveBeenCalledTimes(2);
    expect(await translator.translate({ lines, attempt: 1 })).toEqual([
      '新译甲',
      '新译乙',
    ]);
    expect(requests.at(-1)).toContain('#2:二番目');
  });

  it('停止后不再请求修复，也不触发逐行降级', async () => {
    const controller = new AbortController();
    const { fetch } = mockAnswers(['#1:第一译文']);
    const translator = new OpenAiTranslator(config);
    const fallback = vi.spyOn(translator, 'fallback');
    const lines = ['一番目', '二番目'];
    await expect(
      translator.translate({ lines, attempt: 0, signal: controller.signal }),
    ).rejects.toThrow();
    controller.abort();
    await expect(
      attemptTranslation(translator, { lines, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('响应解析完成时取消，仍不返回成功', async () => {
    const controller = new AbortController();
    mockAnswers(['#1:译文']);
    const promptBuilder = createOpenAiPromptBuilder();
    const translator = new OpenAiTranslator({
      ...config,
      promptBuilder: {
        ...promptBuilder,
        parseAnswer: (answer, lines) => {
          controller.abort();
          return promptBuilder.parseAnswer(answer, lines);
        },
      },
    });
    await expect(
      attemptTranslation(translator, {
        lines: ['本文'],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([true, false])(
    '原生流水线仅缓存完整修复结果：成功=%s',
    async (success) => {
      mockAnswers([
        '#1:第一译文',
        '缺少编号',
        '缺少编号',
        success ? '#1:第二译文' : '缺少编号',
      ]);
      const cache = { get: vi.fn(async () => undefined), set: vi.fn() };
      const save = vi.fn();
      const pipeline = new TranslationPipeline({
        cache,
        segmenter: { segment: (lines) => [{ start: 0, end: lines.length }] },
      });
      try {
        pipeline.registerTranslator(new OpenAiTranslator(config));
        await pipeline.submit({
          lines: ['一番目', '二番目'],
          onComplete: save,
          onError: vi.fn(),
          onAbort: vi.fn(),
        });
        await pipeline.drain();
        expect(save).toHaveBeenCalledOnce();
        const result = save.mock.calls[0][0];
        expect(result.failed).toHaveLength(success ? 0 : 1);
        expect(result.lines).toEqual(
          success ? ['第一译文', '第二译文'] : ['一番目', '二番目'],
        );
        expect(cache.set).toHaveBeenCalledTimes(success ? 1 : 0);
        if (success) expect(cache.set.mock.calls[0][1]).toEqual(result.lines);
      } finally {
        pipeline.dispose();
        await pipeline.drain();
      }
    },
  );
});
