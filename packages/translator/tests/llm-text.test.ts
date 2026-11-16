import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslationCacheKey } from '../src/cache';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import { OpenAiTranslator } from '../src/translator/llm';
import { createOpenAiPromptBuilder } from '../src/translator/llm-prompt';
import {
  isGptPassthroughLine,
  prepareGptText,
} from '../src/translator/llm-text';

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

afterEach(() => vi.unstubAllGlobals());

describe('GPT 文本保护', () => {
  it.each([
    '',
    '　 ',
    '１２３４',
    '…！？☆',
    'https://example.test/a?x=1',
    'URL→https://example.test/',
    'a@example.test',
    'FIN',
    'F I N',
    'Ｆ Ｉ Ｎ',
    'THE END',
    '<br>',
    '{{name}} %1$s \\n',
  ])('明确的非正文不请求模型：%s', async (line) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const translator = new OpenAiTranslator(config);
    expect(await translator.translate({ lines: [line], attempt: 0 })).toEqual([
      line,
    ]);
    expect(await translator.fallback({ lines: [line], attempt: 0 })).toEqual([
      line,
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'This is an English sentence.',
    'She said FIN and left.',
    '日本語の本文。',
    '漢字',
    '詳しくは https://example.test を参照。',
  ])('普通正文仍可翻译：%s', (line) => {
    expect(isGptPassthroughLine(line)).toBe(false);
  });

  it('术语表中明确使用的 FIN 不按结束标记跳过', () => {
    expect(isGptPassthroughLine('FIN', { FIN: '芬' })).toBe(false);
  });

  it('百分比后的普通单词不误识别为格式符', () => {
    expect(prepareGptText(['100% food is ready.']).lines).toEqual([
      '100% food is ready.',
    ]);
  });

  it('保护地址、标签、变量、格式符和转义符，逐字恢复并保持位置与空白', () => {
    const parts = [
      'https://example.test/a?x=$&',
      'a@example.test',
      '<b>',
      '</b>',
      '${name}',
      '{{user}}',
      '{value}',
      '%1$s',
      '\\n',
    ];
    const source = `　原文 ${parts.join(' 本文 ')}　 `;
    const input = Object.freeze(['FIN', source, '123']);
    const text = prepareGptText(input);
    expect(text.lines).toHaveLength(1);
    for (const part of parts) expect(text.lines[0]).not.toContain(part);
    const translated = text.lines[0].replace(/原文|本文/g, '译文');
    expect(text.restore([translated])).toEqual([
      'FIN',
      source.replace(/原文|本文/g, '译文'),
      '123',
    ]);
    expect(text.languageText(0, translated)).not.toContain('__AN_KEEP_');
    expect(input[1]).toBe(source);
  });

  it('拒绝丢失、重复、跨行混入的保护标记和标签次序变化', () => {
    const text = prepareGptText([
      '<b>原文</b>',
      '别の本文 https://example.test',
    ]);
    const first = text.lines[0];
    const tags = first.match(/__AN_KEEP_\d+__/g)!;
    const foreign = text.lines[1].match(/__AN_KEEP_\d+__/g)![0];
    expect(() =>
      text.restore([first.replace(tags[0], ''), text.lines[1]]),
    ).toThrow(/保护标记/);
    expect(() => text.restore([first + tags[0], text.lines[1]])).toThrow(
      /保护标记/,
    );
    expect(() => text.restore([first + foreign, text.lines[1]])).toThrow(
      /保护标记/,
    );
    expect(() =>
      text.restore([`${tags[1]}译文${tags[0]}`, text.lines[1]]),
    ).toThrow(/标签顺序/);
    expect(() => text.restore([])).toThrow(/行数/);
    expect(() => text.restore(['译文\n续行', text.lines[1]])).toThrow(/换行/);
  });

  it('避开原文和上下文已有的标记，移除不再对齐的历史而不修改输入', () => {
    const context = Object.freeze({
      previousSource: '__AN_KEEP_0__',
      history: Object.freeze({
        lines: ['FIN', '本文 https://example.test'],
        translatedLines: ['FIN', '旧译'],
        glossary: {},
      }),
    });
    const text = prepareGptText(context.history.lines, context);
    expect(text.lines[0]).toContain('__AN_KEEP__0__');
    expect(text.context?.history).toBeUndefined();
    expect(text.context?.expired).toBe(true);
    expect(context.history.translatedLines).toEqual(['FIN', '旧译']);
    expect(prepareGptText(['本文'], context).context).toBe(context);
  });

  it.each(['请访问', 'Please visit'])(
    '长链接随正文正确还原，不限制译文语言：%s',
    async (prefix) => {
      const link = `https://example.test/${'a'.repeat(500)}`;
      vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const prompt = body.messages.at(-1).content as string;
        expect(prompt).not.toContain(link);
        const token = prompt.match(/__AN_KEEP_\d+__/g)![0];
        return completion(`#1:${prefix} ${token}。`);
      });
      const translator = new OpenAiTranslator(config);
      expect(
        await translator.translate({
          lines: [`ここを参照 ${link}`],
          attempt: 0,
        }),
      ).toEqual([`${prefix} ${link}。`]);
    },
  );

  it('停止后即使全为保留行也不返回成功', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new OpenAiTranslator(config).translate({
        lines: ['FIN'],
        attempt: 0,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('GPT 缓存使用独立版本，原文空白和保留行仍参与缓存身份', () => {
    const translator = new OpenAiTranslator(config);
    const input = { lines: ['本文', 'FIN'] };
    const oldKey = createTranslationCacheKey(
      config.model,
      input.lines,
      createOpenAiPromptBuilder(),
      true,
    );
    expect(translator.getCacheKey(input)).toBe(`gpt-text:v2:${oldKey}`);
    expect(translator.getCacheKey(input)).not.toBe(
      translator.getCacheKey({ lines: ['本文', 'F I N'] }),
    );
    expect(translator.getCacheKey(input)).not.toBe(
      translator.getCacheKey({ lines: [' 本文', 'FIN'] }),
    );
  });

  it('原生流水线的十二段章节能保留 FIN 末段并执行保存回调', async () => {
    const fetch = vi.fn(async () => completion('#1:译文'));
    vi.stubGlobal('fetch', fetch);
    const pipeline = new TranslationPipeline({
      segmenter: {
        segment: (lines) =>
          lines.map((_, start) => ({ start, end: start + 1 })),
      },
    });
    const save = vi.fn();
    try {
      pipeline.registerTranslator(new OpenAiTranslator(config), {
        concurrency: 4,
      });
      await pipeline.submit({
        lines: [...Array.from({ length: 11 }, () => '本文'), 'F I N'],
        onComplete: save,
        onError: vi.fn(),
        onAbort: vi.fn(),
      });
      await pipeline.drain();
      expect(fetch).toHaveBeenCalledTimes(11);
      expect(save).toHaveBeenCalledExactlyOnceWith({
        lines: [...Array.from({ length: 11 }, () => '译文'), 'F I N'],
        failed: [],
      });
    } finally {
      pipeline.dispose();
      await pipeline.drain();
    }
  });
});
