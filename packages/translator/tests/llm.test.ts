import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

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

  const reply = (content: string) =>
    mockStreamResponse([
      { choices: [{ index: 0, delta: { content } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]);

  const config = {
    endpoint: 'https://api.example.test',
    key: 'test-key',
    model: 'model-1',
  };

  it('只复核译文中疑似漏翻的英文词，并放回原句', async () => {
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return requests.length === 1
        ? reply('#1:他开始 viewing 展品，并用hands触摸它。\n#2:他走了。')
        : reply('#1:REPLACE:查看\n#2:REPLACE:双手');
    });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    await expect(
      attemptTranslation(translator, {
        lines: ['彼は展示品を見て、両手で触るようになった。', '彼は去った。'],
      }),
    ).resolves.toEqual(['他开始查看展品，并用双手触摸它。', '他走了。']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requests[0].messages[0].content).toContain('普通词');
    expect(JSON.parse(requests[1].messages[1].content)).toMatchObject({
      rows: [{ line: 1, source: '彼は展示品を見て、両手で触るようになった。' }],
      review: [{ word: 'viewing' }, { word: 'hands' }],
    });
  });

  it.each([
    [
      '英文',
      'He started viewing the exhibits.',
      '他开始 viewing 展品了。',
      '查看',
      '他开始查看展品了。',
    ],
    [
      '法文',
      'Elle commence à goûter le dessert.',
      '她开始 goûter 甜点。',
      '品尝',
      '她开始品尝甜点。',
    ],
    [
      '韩文',
      '그는 다시 달리기를 시작했다.',
      '他开始 달리기 训练。',
      '跑步',
      '他开始跑步训练。',
    ],
    [
      '俄文',
      'Он начал читать книгу.',
      '他开始 читать 这本书。',
      '读',
      '他开始读这本书。',
    ],
    ['德文', 'Er nahm ein Buch.', '他拿起一本 Buch。', '书', '他拿起一本书。'],
    [
      '西班牙文',
      'Quiero volver a casa.',
      '我想 volver a casa。',
      '回家',
      '我想回家。',
    ],
    [
      '日文',
      '彼は朝食を食べる。',
      '他开始食べる早餐。',
      '吃',
      '他开始吃早餐。',
    ],
    [
      '日文',
      '彼はそれを取り戻す。',
      '他想取り戻す它。',
      '夺回',
      '他想夺回它。',
    ],
    [
      '阿拉伯文',
      'بدأ يقرأ الكتاب.',
      '他开始 يقرأ 这本书。',
      '读',
      '他开始读这本书。',
    ],
  ])(
    '复核 %s 原文直接带进中文译文的普通词',
    async (_language, source, draft, replacement, translated) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(reply(`#1:${draft}`))
        .mockResolvedValueOnce(reply(`#1:REPLACE:${replacement}`));
      vi.stubGlobal('fetch', fetch);
      await expect(
        attemptTranslation(new OpenAiTranslator(config), { lines: [source] }),
      ).resolves.toEqual([translated]);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('术语表中的外文、专名拼写、缩写、链接和代码不触发复核', async () => {
    const lines = [
      'Open it on your iPhone.',
      '星月を呼ぼう。',
      '体力が戻った。',
      '그는 햇살을 불렀다.',
      'この記法を見せる。',
      'https://example.test/a',
    ];
    const translations = [
      '请用 iPhone 打开。',
      '现在召唤 luna 试试。',
      '现在恢复 HP 数值。',
      '他喊了一声 햇살 的名字。',
      '这是 `中文 viewing 中文` 示例。',
      'https://example.test/a',
    ];
    const fetch = vi.fn(async () =>
      reply(
        translations.map((line, index) => `#${index + 1}:${line}`).join('\n'),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    await expect(
      attemptTranslation(translator, {
        lines,
        context: { glossary: { 星月: 'luna', 햇살: '햇살' } },
      }),
    ).resolves.toEqual(translations);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    '#1:KEEP',
    '#1:保留',
    '#1:REPLACE:查看展品。',
    '#1:KEEP\n#1:REPLACE:查看',
    '#2:REPLACE:查看',
    '缺少编号',
    null,
  ])('复核无可用修正结果时接受原译：%s', async (review) => {
    const original = '他开始 viewing 展品了。';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(`#1:${original}`))
      .mockImplementationOnce(async () =>
        review === null
          ? new Response(
              JSON.stringify({ error: { message: 'unavailable' } }),
              { status: 500 },
            )
          : reply(review),
      );
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    await expect(
      attemptTranslation(translator, { lines: ['彼は展示品を見始めた。'] }),
    ).resolves.toEqual([original]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('一行中保留模型确认的专名，只改漏译的普通词', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply('#1:Alice 正在 viewing 展品。'))
      .mockResolvedValueOnce(reply('#2:REPLACE:观看\n#1:KEEP'));
    vi.stubGlobal('fetch', fetch);
    await expect(
      attemptTranslation(new OpenAiTranslator(config), {
        lines: ['Alice is viewing the exhibits.'],
      }),
    ).resolves.toEqual(['Alice 正在观看展品。']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('复核请求超时后仍能返回第一次译文', async () => {
    vi.useFakeTimers();
    try {
      const original = '他开始 viewing 展品了。';
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(reply(`#1:${original}`))
        .mockImplementationOnce(
          (_input: unknown, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener(
                'abort',
                () => reject(init.signal?.reason),
                { once: true },
              );
            }),
        );
      vi.stubGlobal('fetch', fetch);
      const pending = attemptTranslation(new OpenAiTranslator(config), {
        lines: ['彼は展示品を見始めた。'],
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(pending).resolves.toEqual([original]);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('复核期间取消时不返回原译文', async () => {
    const controller = new AbortController();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply('#1:他开始 viewing 展品了。'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return reply('#1:查看');
      });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    await expect(
      attemptTranslation(translator, {
        lines: ['彼は展示品を見始めた。'],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

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
