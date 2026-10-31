import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationPipeline } from '../src/pipeline/translation-pipeline';
import type { TranslateRequest, TranslationWork } from '../src/types';

const pipelines: TranslationPipeline[] = [];
afterEach(() => pipelines.splice(0).forEach((pipeline) => pipeline.dispose()));

function createPipeline() {
  const pipeline = new TranslationPipeline({
    segmenter: {
      segment: (lines) => lines.map((_, start) => ({ start, end: start + 1 })),
    },
  });
  pipelines.push(pipeline);
  return pipeline;
}

type Handlers = Pick<TranslationWork, 'onComplete' | 'onError' | 'onAbort'>;

function work(
  input: string | string[],
  handlers: Partial<Handlers> = {},
): TranslationWork {
  return {
    lines: typeof input === 'string' ? input.split('\n') : input,
    onComplete: vi.fn(),
    onError: vi.fn(),
    onAbort: vi.fn(),
    ...handlers,
  };
}

async function* stream(
  ...works: TranslationWork[]
): AsyncGenerator<TranslationWork> {
  yield* works;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('TranslationPipeline', () => {
  it('按分段限制在途水位，容量释放后才拉取下一篇', async () => {
    const pipeline = createPipeline();
    const gates = Array.from({ length: 4 }, () => deferred<string[]>());
    let requestIndex = 0;
    const translate = vi.fn(() => gates[requestIndex++].promise);
    pipeline.registerTranslator({ translate });
    let pulled = 0;
    const onComplete = vi.fn();
    async function* source() {
      pulled++;
      yield work('甲\n乙\n丙', { onComplete });
      pulled++;
      yield work('丁', { onComplete });
    }
    const running = pipeline.run(source());
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(pulled).toBe(1);

    gates[0].resolve(['一']);
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
    expect(pulled).toBe(1);

    gates[1].resolve(['二']);
    await vi.waitFor(() => expect(pulled).toBe(2));
    gates[2].resolve(['三']);
    gates[3].resolve(['四']);
    await running;
    expect(onComplete.mock.calls.map(([result]) => result)).toEqual([
      { lines: ['一', '二', '三'], failed: [] },
      { lines: ['四'], failed: [] },
    ]);
  });

  it('按原顺序聚合，失败分段回退，并等待异步保存完成', async () => {
    const pipeline = createPipeline();
    const first = deferred<string[]>();
    pipeline.registerTranslator(
      {
        translate: vi.fn(async ({ lines }: TranslateRequest) => {
          if (lines[0] === '甲') return first.promise;
          if (lines[0] === '乙') throw new Error('失败');
          first.resolve(['一']);
          return ['三'];
        }),
      },
      { concurrency: 3 },
    );
    const saved = deferred<void>();
    const onComplete = vi.fn(() => saved.promise);
    const onError = vi.fn();
    let settled = false;
    const running = pipeline
      .run(stream(work('甲\n乙\n丙', { onComplete, onError })))
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        lines: ['一', '乙', '三'],
        failed: [{ order: 1, error: expect.any(Error) }],
      }),
    );
    expect(settled).toBe(false);
    saved.resolve();
    await running;
    expect(onError).not.toHaveBeenCalled();
    await expect(pipeline.translate({ lines: ['丙'] })).resolves.toEqual({
      lines: ['三'],
      failed: [],
    });
  });

  it('取消只清理本次输入，同时取消在途请求，不影响其他翻译', async () => {
    const pipeline = createPipeline();
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const translate = vi.fn(async ({ lines, signal }: TranslateRequest) => {
      if (lines[0] !== '甲') return ['译文'];
      requestSignal = signal;
      return new Promise<string[]>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    });
    pipeline.registerTranslator({ translate });
    const onError = vi.fn();
    const onAbort = vi.fn();
    const onComplete = vi.fn();
    const running = pipeline.run(
      stream(work('甲\n乙', { onComplete, onError, onAbort })),
      { signal: controller.signal },
    );
    const rejected = expect(running).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    const other = pipeline.translate({ lines: ['丙'] });
    controller.abort();
    await rejected;
    await expect(other).resolves.toEqual({ lines: ['译文'], failed: [] });
    expect(requestSignal?.aborted).toBe(true);
    expect(translate.mock.calls.map(([{ lines }]) => lines[0])).toEqual([
      '甲',
      '丙',
    ]);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('拉取期间取消也通知已取到的输入，并关闭源', async () => {
    const pipeline = createPipeline();
    const controller = new AbortController();
    const closed = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    async function* source() {
      try {
        controller.abort();
        yield work('甲', { onError, onAbort });
      } finally {
        closed();
      }
    }
    await expect(
      pipeline.run(source(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onAbort).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('空行与图片行不进入翻译器，译文按原位回填', async () => {
    const pipeline = new TranslationPipeline({
      segmenter: { segment: (lines) => [{ start: 0, end: lines.length }] },
    });
    pipelines.push(pipeline);
    const translate = vi.fn(async ({ lines }: TranslateRequest) =>
      lines.map((line) => `译${line}`),
    );
    pipeline.registerTranslator({ translate });

    await expect(
      pipeline.translate({
        lines: ['甲', '', '<图片>https://a.test/x.jpg', '乙'],
      }),
    ).resolves.toEqual({
      lines: ['译甲', '', '<图片>https://a.test/x.jpg', '译乙'],
      failed: [],
    });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].lines).toEqual(['甲', '乙']);
  });

  it('全为透传行的分段不调用翻译器', async () => {
    const pipeline = createPipeline();
    const translate = vi.fn(async ({ lines }: TranslateRequest) => lines);
    pipeline.registerTranslator({ translate });

    await expect(
      pipeline.translate({ lines: [' ', '<图片>x'] }),
    ).resolves.toEqual({
      lines: [' ', '<图片>x'],
      failed: [],
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it('移除翻译器时在途分段退回队列，改由其他翻译器完成', async () => {
    const pipeline = createPipeline();
    let calls = 0;
    const first = vi.fn(async ({ lines, signal }: TranslateRequest) => {
      calls++;
      if (calls === 1) {
        return new Promise<string[]>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return [`译${lines[0]}`];
    });
    const second = vi.fn(async ({ lines }: TranslateRequest) => [
      `好${lines[0]}`,
    ]);
    const onSegError = vi.fn();
    const id = pipeline.registerTranslator({ translate: first });
    const onComplete = vi.fn();
    const running = pipeline.run(
      stream(work('甲', { onComplete, tracker: { onSegError } })),
    );
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));

    pipeline.registerTranslator({ translate: second }, { id: 'second' });
    pipeline.unregisterTranslator(id);
    await running;

    expect(onComplete).toHaveBeenCalledWith({ lines: ['好甲'], failed: [] });
    expect(onSegError).not.toHaveBeenCalled();
  });

  it('dispose 取消未完成的输入，调用方不会永久等待', async () => {
    const pipeline = createPipeline();
    const gate = deferred<string[]>();
    const translate = vi.fn(() => gate.promise);
    pipeline.registerTranslator({ translate }, { concurrency: 1 });
    // 第一段占住容量，其余分段排在队列或等待入队。
    const pending = pipeline.translate({ lines: ['甲', '乙', '丙'] });
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));

    pipeline.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    // 重新注册后仍可继续使用。
    pipeline.registerTranslator({
      translate: async ({ lines }: TranslateRequest) =>
        lines.map((line) => `译${line}`),
    });
    await expect(pipeline.translate({ lines: ['丁'] })).resolves.toEqual({
      lines: ['译丁'],
      failed: [],
    });
  });

  it('保存失败通知 onError，且保存背压也限制输入拉取', async () => {
    const pipeline = createPipeline();
    pipeline.registerTranslator({ translate: async () => ['译文'] });
    const saving = deferred<void>();
    const error = new Error('保存失败');
    let pulled = 0;
    const onComplete = vi.fn(async () => {
      if (onComplete.mock.calls.length === 1) {
        await saving.promise;
        throw error;
      }
    });
    const onError = vi.fn();
    async function* source() {
      pulled++;
      yield work('甲', { onComplete, onError });
      pulled++;
      yield work('乙');
    }
    const running = pipeline.run(source(), { maxPendingInputs: 1 });
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(pulled).toBe(1);
    saving.resolve();
    await running;
    expect(pulled).toBe(2);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
