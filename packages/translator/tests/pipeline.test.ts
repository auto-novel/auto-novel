import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import type { TranslateRequest, TranslationWork } from '../src/types';

const pipelines: TranslationPipeline[] = [];
afterEach(() => pipelines.splice(0).forEach((pipeline) => pipeline.dispose()));

function createPipeline(onSchedulingChange?: () => void) {
  const pipeline = new TranslationPipeline({
    onSchedulingChange,
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

/** 推模型下的批量执行：逐项投递，最后等全部结算。 */
async function runAll(
  pipeline: TranslationPipeline,
  source: AsyncIterable<TranslationWork>,
  signal?: AbortSignal,
): Promise<void> {
  try {
    for await (const work of source) await pipeline.submit(work, signal);
    await pipeline.drain();
    signal?.throwIfAborted();
  } finally {
    await pipeline.drain().catch(() => {});
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('TranslationPipeline', () => {
  it('并行 submit 不阻塞新队首，未完成的长输入即时计入水位', async () => {
    const capacity = vi.fn();
    const pipeline = createPipeline(capacity);
    expect(capacity).not.toHaveBeenCalled();
    expect(pipeline.needsInput()).toBe(false);
    const first = deferred<string[]>();
    const started: string[] = [];
    const translate = vi.fn(async ({ lines }: TranslateRequest) => {
      started.push(lines[0]);
      return lines[0] === '甲' ? first.promise : [`译${lines[0]}`];
    });
    pipeline.registerTranslator({ trusted: true, translate });
    expect(pipeline.needsInput()).toBe(true);
    const long = { ...work('甲\n乙\n丙\n丁'), getPriority: () => 0 };
    const submittingLong = pipeline.submit(long);
    expect(pipeline.needsInput()).toBe(false);
    await vi.waitFor(() => expect(started).toEqual(['甲']));
    expect(pipeline.needsInput()).toBe(false);
    expect(pipeline.needsInput(-1)).toBe(true);
    let priority = 1;
    const head = { ...work('戊'), getPriority: () => priority };
    const submittingHead = pipeline.submit(head);
    priority = -1;
    capacity.mockClear();
    pipeline.refreshScheduling();
    await Promise.resolve();
    expect(capacity).toHaveBeenCalled();
    expect(started).toEqual(['甲']);
    first.resolve(['译甲']);
    await Promise.all([submittingLong, submittingHead]);
    await pipeline.drain();
    expect(started).toEqual(['甲', '戊', '乙', '丙', '丁']);
    expect(long.onComplete).toHaveBeenCalledOnce();
    expect(head.onComplete).toHaveBeenCalledOnce();
    expect(long.onAbort).not.toHaveBeenCalled();
    expect(pipeline.needsInput()).toBe(true);
  });

  it('全局水位同时计算执行中和等待分段，相同优先级保持输入与分段顺序', async () => {
    const pipeline = createPipeline();
    const gates = Array.from({ length: 4 }, () => deferred<string[]>());
    const translate = vi.fn(
      () => gates[translate.mock.calls.length - 1].promise,
    );
    pipeline.registerTranslator({ trusted: false, translate });
    let admitted = false;
    const submitting = pipeline.submit(work('甲\n乙\n丙')).then(() => {
      admitted = true;
    });
    const submittingLast = pipeline.submit(work('丁'));
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
    expect(admitted).toBe(false);
    gates[0].resolve(['译甲']);
    await submitting;
    // 甲完成、乙执行中、丙等待；丁尚未准入，不能另开一条水位。
    expect(pipeline.needsInput()).toBe(false);
    gates[1].resolve(['译乙']);
    gates[2].resolve(['译丙']);
    gates[3].resolve(['译丁']);
    await submittingLast;
    await pipeline.drain();
    expect(translate.mock.calls.map(([{ lines }]) => lines[0])).toEqual([
      '甲',
      '乙',
      '丙',
      '丁',
    ]);
  });

  it('可信翻译器忙碌时，受限等待分段不阻塞空闲的非可信翻译器', async () => {
    const pipeline = createPipeline();
    const remoteGate = deferred<void>();
    const localGate = deferred<string[]>();
    const trusted = vi.fn(async ({ lines }: TranslateRequest) => {
      await remoteGate.promise;
      return lines.map((line) => `译${line}`);
    });
    const untrusted = vi.fn(() => localGate.promise);
    pipeline.registerTranslator({ trusted: true, translate: trusted });
    pipeline.registerTranslator({ trusted: false, translate: untrusted });
    const remote = {
      ...work('甲\n乙\n丙\n丁'),
      trustedOnly: true,
      getPriority: () => 0,
    };
    await pipeline.submit(remote);
    await vi.waitFor(() => expect(trusted).toHaveBeenCalledOnce());
    expect(pipeline.needsInput(1, true)).toBe(false);
    expect(pipeline.needsInput(1, false)).toBe(true);

    const local = { ...work('戊'), getPriority: () => 1 };
    await pipeline.submit(local);
    await vi.waitFor(() => expect(untrusted).toHaveBeenCalledOnce());
    // 两个翻译器都忙时不能继续拉取低优先级输入；全局水位仍生效。
    expect(pipeline.needsInput(1, false)).toBe(false);
    expect(remote.onComplete).not.toHaveBeenCalled();
    localGate.resolve(['译戊']);
    await vi.waitFor(() => expect(local.onComplete).toHaveBeenCalledOnce());
    expect(trusted).toHaveBeenCalledOnce();
    remoteGate.resolve();
    await pipeline.drain();
    expect(remote.onComplete).toHaveBeenCalledOnce();
    expect(trusted.mock.calls.map(([{ lines }]) => lines[0])).toEqual([
      '甲',
      '乙',
      '丙',
      '丁',
    ]);
  });

  it('没有可信翻译器的远程暂存不占全局水位，恢复能力后继续执行', async () => {
    const pipeline = createPipeline();
    const local = vi.fn(async ({ lines }: TranslateRequest) => [...lines]);
    pipeline.registerTranslator({ trusted: false, translate: local });
    expect(pipeline.needsInput(Infinity, true)).toBe(false);
    const remote = { ...work('甲\n乙\n丙\n丁'), trustedOnly: true };
    const submittingRemote = pipeline.submit(remote);
    expect(pipeline.needsInput()).toBe(true);
    const ordinary = work('戊');
    await pipeline.submit(ordinary);
    await vi.waitFor(() => expect(ordinary.onComplete).toHaveBeenCalledOnce());
    expect(remote.onComplete).not.toHaveBeenCalled();
    expect(local.mock.calls.map(([{ lines }]) => lines)).toEqual([['戊']]);
    pipeline.registerTranslator({ trusted: true, translate: local });
    await submittingRemote;
    await pipeline.drain();
    expect(remote.onComplete).toHaveBeenCalledOnce();
  });

  it('按水位限制入队，篇目最多领先一篇', async () => {
    const pipeline = createPipeline();
    const gates = Array.from({ length: 4 }, () => deferred<string[]>());
    let requestIndex = 0;
    const translate = vi.fn(() => gates[requestIndex++].promise);
    pipeline.registerTranslator({ trusted: false, translate });
    let pulled = 0;
    const onComplete = vi.fn();
    async function* source() {
      pulled++;
      yield work('甲\n乙\n丙', { onComplete });
      pulled++;
      yield work('丁', { onComplete });
    }
    const running = runAll(pipeline, source());
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    // 第一篇还有分段没入队，submit 仍被水位挡住，不会去拉第二篇。
    expect(pulled).toBe(1);

    gates[0].resolve(['一']);
    await vi.waitFor(() => expect(pulled).toBe(2));
    // 第二篇已投递，但同一时刻只有一段在翻译。
    expect(translate).toHaveBeenCalledTimes(2);

    gates[1].resolve(['二']);
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
        trusted: false,
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
    const running = runAll(
      pipeline,
      stream(work('甲\n乙\n丙', { onComplete, onError })),
    ).then(() => {
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
    pipeline.registerTranslator({ trusted: false, translate });
    const onError = vi.fn();
    const onAbort = vi.fn();
    const onComplete = vi.fn();
    const running = runAll(
      pipeline,
      stream(work('甲\n乙', { onComplete, onError, onAbort })),
      controller.signal,
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

  it.each([
    { name: '背压期间外部取消', dispose: false, lines: ['甲', '乙', '丙'] },
    { name: '背压期间关闭流水线', dispose: true, lines: ['甲', '乙', '丙'] },
    { name: '入队后关闭流水线', dispose: true, lines: ['甲'] },
  ])('$name 只通知一次 onAbort', async ({ dispose, lines }) => {
    const pipeline = createPipeline();
    const controller = new AbortController();
    const translate = vi.fn(
      ({ signal }: TranslateRequest) =>
        new Promise<string[]>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    pipeline.registerTranslator({ trusted: false, translate });
    const input = work(lines);
    // dispose 场景不传外部 signal，确保使用的是流水线自身的取消信号。
    const submitting = pipeline.submit(
      input,
      dispose ? undefined : controller.signal,
    );
    let submitted = false;
    const outcome = submitting.then(
      () => {
        submitted = true;
      },
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
    expect(submitted).toBe(lines.length === 1);

    if (dispose) pipeline.dispose();
    else controller.abort();

    if (lines.length > 1) {
      await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    } else {
      await expect(outcome).resolves.toBeUndefined();
    }
    await pipeline.drain();
    expect(input.onAbort).toHaveBeenCalledOnce();
    expect(input.onError).not.toHaveBeenCalled();
    expect(input.onComplete).not.toHaveBeenCalled();
  });

  it('准备失败只通知一次 onError，回调错误由 drain 上抛', async () => {
    const prepareError = new Error('分段失败');
    const callbackError = new Error('错误处理失败');
    const pipeline = new TranslationPipeline({
      segmenter: {
        segment: () => {
          throw prepareError;
        },
      },
    });
    pipelines.push(pipeline);
    const input = work('甲', {
      onError: vi.fn(() => {
        throw callbackError;
      }),
    });

    await expect(pipeline.submit(input)).resolves.toBeUndefined();
    await expect(pipeline.drain()).rejects.toBe(callbackError);
    expect(input.onError).toHaveBeenCalledExactlyOnceWith(prepareError);
    expect(input.onAbort).not.toHaveBeenCalled();
    expect(input.onComplete).not.toHaveBeenCalled();
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
      runAll(pipeline, source(), controller.signal),
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
    pipeline.registerTranslator({ trusted: false, translate });

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
    pipeline.registerTranslator({ trusted: false, translate });

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
    const id = pipeline.registerTranslator({
      trusted: false,
      translate: first,
    });
    const onComplete = vi.fn();
    const running = runAll(
      pipeline,
      stream(work('甲', { onComplete, tracker: { onSegError } })),
    );
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));

    pipeline.registerTranslator(
      { trusted: false, translate: second },
      { id: 'second' },
    );
    pipeline.unregisterTranslator(id);
    await running;

    expect(onComplete).toHaveBeenCalledWith({ lines: ['好甲'], failed: [] });
    expect(onSegError).not.toHaveBeenCalled();
  });

  it('dispose 取消未完成的输入，调用方不会永久等待', async () => {
    const pipeline = createPipeline();
    const gate = deferred<string[]>();
    const translate = vi.fn(() => gate.promise);
    pipeline.registerTranslator(
      { trusted: false, translate },
      { concurrency: 1 },
    );
    // 第一段占住容量，其余分段排在队列或等待入队。
    const pending = pipeline.translate({ lines: ['甲', '乙', '丙'] });
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));

    pipeline.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    // 重新注册后仍可继续使用。
    pipeline.registerTranslator({
      trusted: false,
      translate: async ({ lines }: TranslateRequest) =>
        lines.map((line) => `译${line}`),
    });
    await expect(pipeline.translate({ lines: ['丁'] })).resolves.toEqual({
      lines: ['译丁'],
      failed: [],
    });
  });

  it('可信限定的 translate 可取消，取消后普通输入仍可翻译', async () => {
    const pipeline = createPipeline();
    const translate = vi.fn(async () => ['译文']);
    pipeline.registerTranslator({ trusted: false, translate });
    const controller = new AbortController();
    const pending = pipeline.translate(
      { lines: ['甲', '乙', '丙'], trustedOnly: true },
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await pipeline.translate({ lines: ['丁'] });
    controller.abort();
    await rejected;
    await expect(pipeline.translate({ lines: ['戊'] })).resolves.toEqual({
      lines: ['译文'],
      failed: [],
    });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('保存失败通知 onError，且 run 收尾前等待结算完成', async () => {
    const pipeline = createPipeline();
    pipeline.registerTranslator({
      trusted: false,
      translate: async () => ['译文'],
    });
    const saving = deferred<void>();
    const error = new Error('保存失败');
    let finished = false;
    const onComplete = vi.fn(async () => {
      if (onComplete.mock.calls.length === 1) {
        await saving.promise;
        throw error;
      }
    });
    const onError = vi.fn();
    const running = runAll(
      pipeline,
      stream(work('甲', { onComplete, onError })),
    ).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);

    saving.resolve();
    await running;
    expect(onError).toHaveBeenCalledWith(error);
    expect(finished).toBe(true);
  });

  it('submit 入队即返回，drain 等待结算', async () => {
    const pipeline = createPipeline();
    const gate = deferred<string[]>();
    pipeline.registerTranslator({
      trusted: false,
      translate: () => gate.promise,
    });
    const onComplete = vi.fn();

    await pipeline.submit(work('甲', { onComplete }));
    expect(onComplete).not.toHaveBeenCalled();

    gate.resolve(['译甲']);
    await pipeline.drain();
    expect(onComplete).toHaveBeenCalledWith({ lines: ['译甲'], failed: [] });
  });
});
