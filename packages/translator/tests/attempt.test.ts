import { describe, expect, it, vi } from 'vitest';

import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';
import { TranslationRejected } from '../src/translator/errors';

const request = { lines: ['甲', '乙'] };

describe('attemptTranslation', () => {
  it('行数始终不合时按次数重试并调用降级', async () => {
    const translate = vi.fn(async () => ['只有一行']);
    const fallback = vi.fn(async ({ lines }) => lines.map((l) => `译${l}`));
    await expect(
      attemptTranslation({ translate, fallback }, request),
    ).resolves.toEqual(['译甲', '译乙']);
    expect(translate).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('无降级策略时抛出失败', async () => {
    const translate = vi.fn(async () => []);
    await expect(attemptTranslation({ translate }, request)).rejects.toThrow(
      '重试次数过多',
    );
    expect(translate).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
  });

  it('语言失败只重试，不触发降级', async () => {
    const translate = vi.fn(async () => {
      throw new TranslationRejected('language', '输出语言不是中文');
    });
    const fallback = vi.fn(async ({ lines }: { lines: string[] }) => lines);
    await expect(
      attemptTranslation({ translate, fallback }, request),
    ).rejects.toThrow('重试次数过多');
    expect(translate).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('传输失败重试耗尽后抛错，不触发降级', async () => {
    const translate = vi.fn(async () => {
      throw new TranslationRejected('request', '请求超时');
    });
    const fallback = vi.fn(async ({ lines }: { lines: string[] }) => lines);
    await expect(
      attemptTranslation({ translate, fallback }, request),
    ).rejects.toThrow('重试次数过多');
    expect(translate).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('非软失败（鉴权、取消等）不重试', async () => {
    const fatal = vi.fn(async () => {
      throw new Error('鉴权失败');
    });
    await expect(
      attemptTranslation({ translate: fatal }, request),
    ).rejects.toThrow('鉴权失败');
    expect(fatal).toHaveBeenCalledOnce();

    const aborted = new AbortController();
    aborted.abort(new DOMException('已取消', 'AbortError'));
    const cancelled = vi.fn(async () => ['译甲', '译乙']);
    await expect(
      attemptTranslation(
        { translate: cancelled },
        {
          ...request,
          signal: aborted.signal,
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('把从 0 开始的尝试序号传给实现', async () => {
    const attempts: number[] = [];
    const translate = vi.fn(async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt < 2) throw new TranslationRejected('degraded', '输出退化');
      return ['译甲', '译乙'];
    });
    await expect(attemptTranslation({ translate }, request)).resolves.toEqual([
      '译甲',
      '译乙',
    ]);
    expect(attempts).toEqual([0, 1, 2]);
  });
});
