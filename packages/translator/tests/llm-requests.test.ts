import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import { OpenAiTranslator } from '../src/translator/llm';
import { createOpenAiPromptBuilder } from '../src/translator/llm-prompt';
import { InFlightRequests } from '../src/translator/llm-requests';

const config = {
  endpoint: 'https://api.example.test',
  key: 'test-key',
  model: 'model-1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const completion = (text = '#1:译文', reasoning?: string) =>
  new Response(
    [
      {
        choices: [
          { index: 0, delta: { content: text, reasoning_content: reasoning } },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );

afterEach(() => vi.unstubAllGlobals());

describe('GPT 进行中请求合并', () => {
  it('相同提示词只调用并记录一次模型结果，各调用方独立解析', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion('#1:译文', '共享思考');
    });
    vi.stubGlobal('fetch', fetch);
    const promptBuilder = createOpenAiPromptBuilder();
    const parseAnswer = vi.fn(promptBuilder.parseAnswer);
    const log = vi.fn();
    const translator = new OpenAiTranslator({
      ...config,
      log,
      promptBuilder: { ...promptBuilder, parseAnswer },
    });
    const running = Array.from({ length: 8 }, () =>
      translator.translate({ lines: ['原文'], attempt: 0 }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    gate.resolve();
    const results = await Promise.all(running);
    expect(fetch).toHaveBeenCalledOnce();
    expect(parseAnswer).toHaveBeenCalledTimes(8);
    expect(
      log.mock.calls.filter(([message]) => message.startsWith('思考：')),
    ).toEqual([['思考：共享思考']]);
    expect(results.every((result) => result[0] === '译文')).toBe(true);
    results[0][0] = '调用方修改';
    expect(results[1]).toEqual(['译文']);
  });

  it('不同原文、术语及前文不合并', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion();
    });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    const running = [
      { lines: ['原文'] },
      { lines: ['另一原文'] },
      { lines: ['原文'], context: { glossary: { 原文: '指定译文' } } },
      { lines: ['原文'], context: { previousSource: '前文' } },
    ].map((request) => translator.translate({ ...request, attempt: 0 }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    gate.resolve();
    await Promise.all(running);
  });

  it('自定义提示词相同但原文不同，仍保留解析所需的原文身份', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion();
    });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator({
      ...config,
      promptBuilder: { build: () => [], parseAnswer: () => ['译文'] },
    });
    const running = ['甲', '乙'].map((line) =>
      translator.translate({ lines: [line], attempt: 0 }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    gate.resolve();
    await Promise.all(running);
  });

  it('翻译器实例之间不共享请求或凭据', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion();
    });
    vi.stubGlobal('fetch', fetch);
    const running = [config, { ...config, key: 'another-key' }].map((options) =>
      new OpenAiTranslator(options).translate({ lines: ['原文'], attempt: 0 }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    gate.resolve();
    await Promise.all(running);
  });

  it.each([0, 1])(
    '取消第 %s 个调用方时保留其他调用方的请求',
    async (cancelled) => {
      const gate = deferred<void>();
      let requestSignal: AbortSignal | undefined;
      const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
        requestSignal = init.signal!;
        await gate.promise;
        return completion();
      });
      vi.stubGlobal('fetch', fetch);
      const translator = new OpenAiTranslator(config);
      const controllers = [new AbortController(), new AbortController()];
      const running = controllers.map((controller) =>
        translator.translate({
          lines: ['原文'],
          attempt: 0,
          signal: controller.signal,
        }),
      );
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      const stopped = expect(running[cancelled]).rejects.toMatchObject({
        name: 'AbortError',
      });
      controllers[cancelled].abort();
      await stopped;
      expect(requestSignal?.aborted).toBe(false);
      gate.resolve();
      expect(await running[1 - cancelled]).toEqual(['译文']);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('全部调用方取消时终止 HTTP，下一次调用可以重新请求', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn((_input: unknown, init: RequestInit) => {
      if (fetch.mock.calls.length > 1) return Promise.resolve(completion());
      requestSignal = init.signal!;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener(
          'abort',
          () => reject(requestSignal!.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    const controllers = [new AbortController(), new AbortController()];
    const running = controllers.map((controller) =>
      translator.translate({
        lines: ['原文'],
        attempt: 0,
        signal: controller.signal,
      }),
    );
    const results = Promise.allSettled(running);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controllers.forEach((controller) => controller.abort());
    expect(
      (await results).every((result) => result.status === 'rejected'),
    ).toBe(true);
    expect(requestSignal?.aborted).toBe(true);
    expect(await translator.translate({ lines: ['原文'], attempt: 0 })).toEqual(
      ['译文'],
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('已取消的调用方不发请求，也不影响正在等待的调用方', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion();
    });
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    const running = translator.translate({ lines: ['原文'], attempt: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      translator.translate({
        lines: ['原文'],
        attempt: 0,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    gate.resolve();
    expect(await running).toEqual(['译文']);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('没有持久缓存的后续调用重新请求，进行中表不保留完成结果', async () => {
    const fetch = vi.fn(async () => completion());
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    await translator.translate({ lines: ['原文'], attempt: 0 });
    await translator.translate({ lines: ['原文'], attempt: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('共享的传输失败不会被记住，外层重试仍可恢复', async () => {
    const fetch = vi.fn(async () =>
      fetch.mock.calls.length === 1
        ? new Response(
            JSON.stringify({ error: { message: 'temporary failure' } }),
            { status: 429, headers: { 'content-type': 'application/json' } },
          )
        : completion(),
    );
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    const fallback = vi.spyOn(translator, 'fallback');
    expect(
      await Promise.all(
        Array.from({ length: 2 }, () =>
          attemptTranslation(translator, { lines: ['原文'] }),
        ),
      ),
    ).toEqual([['译文'], ['译文']]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('重复的失败尝试复用 HTTP，耗尽原有预算后仍正常报错', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'service unavailable' } }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        attemptTranslation(translator, { lines: ['原文'] }),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
  });

  it('发起前全部取消立即释放请求，同键新调用不等待旧请求清理', async () => {
    const requests = new InFlightRequests<string>();
    const controller = new AbortController();
    const cancelled = vi.fn(async () => '旧结果');
    const create = vi.fn(async () => '新结果');
    const first = requests.run('same', cancelled, controller.signal);
    const stopped = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    const second = requests.run('same', create);
    await stopped;
    expect(await second).toBe('新结果');
    expect(cancelled).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });

  it('旧请求迟到的完成不能清除同键的新请求', async () => {
    const requests = new InFlightRequests<string>();
    const old = deferred<string>();
    const current = deferred<string>();
    const controller = new AbortController();
    const first = requests.run('same', () => old.promise, controller.signal);
    await Promise.resolve();
    const stopped = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await stopped;
    const create = vi.fn(() => current.promise);
    const second = requests.run('same', create);
    old.resolve('旧结果');
    await old.promise;
    await Promise.resolve();
    const third = requests.run('same', create);
    current.resolve('新结果');
    expect(await Promise.all([second, third])).toEqual(['新结果', '新结果']);
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('GPT 复用现有分段缓存', () => {
  it.each([false, true])(
    '同时请求复用模型，后续请求命中现有缓存；首次写入失败=%s',
    async (failFirstWrite) => {
      const gate = deferred<void>();
      const fetch = vi.fn(async () => {
        await gate.promise;
        return completion();
      });
      vi.stubGlobal('fetch', fetch);
      const entries = new Map<string, readonly string[]>();
      let writes = 0;
      const cache = {
        get: vi.fn(async (key: string) => entries.get(key)),
        set: vi.fn(async (key: string, lines: readonly string[]) => {
          if (failFirstWrite && writes++ === 0)
            throw new Error('storage unavailable');
          entries.set(key, [...lines]);
        }),
      };
      const pipeline = new TranslationPipeline({ cache });
      const saves = [vi.fn(), vi.fn()];
      const started = vi.fn();
      try {
        pipeline.registerTranslator(new OpenAiTranslator(config), {
          concurrency: 2,
        });
        const running = saves.map((save) =>
          pipeline.submit({
            lines: ['原文'],
            tracker: { onSegStart: started },
            onComplete: save,
            onAbort: vi.fn(),
            onError: vi.fn(),
          }),
        );
        await vi.waitFor(() => {
          expect(started).toHaveBeenCalledTimes(2);
          expect(fetch).toHaveBeenCalledOnce();
        });
        gate.resolve();
        await Promise.all(running);
        await pipeline.drain();
        for (const save of saves)
          expect(save).toHaveBeenCalledExactlyOnceWith({
            lines: ['译文'],
            failed: [],
          });
        saves[0].mock.calls[0][0].lines[0] = '调用方修改';
        expect(saves[1].mock.calls[0][0].lines).toEqual(['译文']);
        const result = await pipeline.translate({ lines: ['原文'] });
        expect(result).toEqual({ lines: ['译文'], failed: [] });
        expect(fetch).toHaveBeenCalledOnce();
        expect(cache.set).toHaveBeenCalledTimes(2);
      } finally {
        gate.resolve();
        pipeline.dispose();
        await pipeline.drain();
      }
    },
  );

  it('取消一个任务时不保存它的译文，其他任务继续完成并写入缓存', async () => {
    const gate = deferred<void>();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return completion();
    });
    vi.stubGlobal('fetch', fetch);
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    const pipeline = new TranslationPipeline({ cache });
    const save = vi.fn();
    const cancelledSave = vi.fn();
    const aborted = vi.fn();
    const started = vi.fn();
    const controller = new AbortController();
    try {
      pipeline.registerTranslator(new OpenAiTranslator(config), {
        concurrency: 2,
      });
      const first = pipeline.submit(
        {
          lines: ['原文'],
          tracker: { onSegStart: started },
          onComplete: cancelledSave,
          onAbort: aborted,
          onError: vi.fn(),
        },
        controller.signal,
      );
      const second = pipeline.submit({
        lines: ['原文'],
        tracker: { onSegStart: started },
        onComplete: save,
        onAbort: vi.fn(),
        onError: vi.fn(),
      });
      await vi.waitFor(() => {
        expect(started).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenCalledOnce();
      });
      controller.abort();
      await first;
      await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce());
      gate.resolve();
      await second;
      await pipeline.drain();
      expect(cancelledSave).not.toHaveBeenCalled();
      expect(aborted).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledExactlyOnceWith({
        lines: ['译文'],
        failed: [],
      });
      expect(cache.set).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      gate.resolve();
      pipeline.dispose();
      await pipeline.drain();
    }
  });
});
