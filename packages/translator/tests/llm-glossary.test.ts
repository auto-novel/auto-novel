import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '../src/factory';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import {
  attemptTranslation,
  TRANSLATION_RETRIES,
} from '../src/pipeline/attempt';
import {
  createGlossarySample,
  readAutoGlossary,
} from '../src/translator/llm-glossary';

const config = {
  kind: 'openai' as const,
  endpoint: 'https://api.example.test',
  key: 'test-key',
  model: 'model-1',
};
const sample = ['アルテはセレニアへ向かった。', 'アルテもセレニアを覚えた。'];
const candidate = (source = 'アルテ', target = '阿尔蒂', kind = 'person') => ({
  source,
  target,
  kind,
  important: true,
});
const answer = JSON.stringify([candidate()]);
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

describe('自动关键术语筛选', () => {
  it('接受反复出现的各类关键专名，输出原站的术语映射格式', () => {
    const terms = [
      candidate(),
      candidate('セレニア', '瑟蕾尼亚', 'place'),
      candidate('星詠騎士団', '咏星骑士团', 'organization'),
      candidate('天狼閃', '天狼闪', 'skill'),
      candidate('星紋剣', '星纹剑', 'item'),
      candidate('星脈', '星脉', 'world'),
    ];
    const lines = [
      ...sample,
      '星詠騎士団の天狼閃は星紋剣と星脈を使う。',
      '星詠騎士団が天狼閃を星紋剣と星脈に向けた。',
    ];
    expect(readAutoGlossary(JSON.stringify(terms), lines)).toEqual(
      Object.fromEntries(terms.map((term) => [term.source, term.target])),
    );
  });
  it('过滤普通词、称呼、整句、只出现一次的词和未出现的词', () => {
    const lines = [
      '魔法を使う春。アルテさんは来た。',
      '魔法を使う春。アルテさんは来た。',
      '一度だけセレニアに行く。',
    ];
    const terms = [
      candidate('魔法', '魔法'),
      candidate('春', '春'),
      candidate('アルテさん', '阿尔蒂小姐'),
      candidate('アルテさんは来た。', '阿尔蒂来了'),
      candidate('セレニア', '瑟蕾尼亚', 'place'),
      candidate('存在しない', '不存在'),
    ];
    expect(readAutoGlossary(JSON.stringify(terms), lines)).toEqual({});
  });
  it('不接受模型的低重要性、说明、假名译文、无关类别与一词多译', () => {
    const terms = [
      candidate(),
      candidate('アルテ', '另一个译名'),
      { ...candidate('セレニア', '瑟蕾尼亚'), important: false },
      candidate('セレニア', '瑟蕾尼亚 #城市', 'place'),
      candidate('セレニア', 'セレニア', 'place'),
      candidate('セレニア', '瑟蕾尼亚', 'ordinary'),
    ];
    expect(readAutoGlossary(JSON.stringify(terms), sample)).toEqual({});
  });
  it('拒绝会误匹配更长词的短名', () => {
    const lines = ['ベルとレベル。ベルが来た。', 'ベルを呼ぶ。ベルがいた。'];
    expect(
      readAutoGlossary(JSON.stringify([candidate('ベル', '贝尔')]), lines),
    ).toEqual({});
  });
  it('样本有界且不修改原文，空结果可直接继续', () => {
    const input = Object.freeze([
      '',
      '<图片>image',
      'アルテ。',
      'x'.repeat(13000),
      '后文',
    ]);
    const sampled = createGlossarySample(input);
    expect(sampled).toEqual(['アルテ。']);
    expect(JSON.stringify(sampled).length).toBeLessThanOrEqual(12000);
    expect(input).toHaveLength(5);
    expect(readAutoGlossary('[]', sample)).toEqual({});
    expect(() => readAutoGlossary('not json', sample)).toThrow();
  });
});

describe('原生队列中的术语分析', () => {
  it('分析与正文共用两个 worker，分析等待时其他正文仍可完成，并可命中缓存', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;
    const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      active++;
      peak = Math.max(peak, active);
      try {
        if (body.messages[0].content.includes('关键术语提取')) {
          await gate;
          return completion(answer);
        }
        return completion('#1:正文译文');
      } finally {
        active--;
      }
    });
    vi.stubGlobal('fetch', fetch);
    const entries = new Map<string, readonly string[]>();
    const pipeline = new TranslationPipeline({
      cache: {
        get: async (key) => entries.get(key),
        set: async (key, lines) => {
          entries.set(key, [...lines]);
        },
      },
    });
    const input = {
      lines: [JSON.stringify(sample)],
      purpose: 'glossary' as const,
    };
    try {
      pipeline.registerTranslator(await createTranslator(config), {
        concurrency: 2,
      });
      const analyzing = pipeline.translate(input);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      expect(await pipeline.translate({ lines: ['日本語の本文'] })).toEqual({
        lines: ['正文译文'],
        failed: [],
      });
      expect(active).toBe(1);
      release();
      const result = await analyzing;
      expect(result.failed).toEqual([]);
      expect(readAutoGlossary(result.lines[0], sample)).toEqual({
        アルテ: '阿尔蒂',
      });
      expect(await pipeline.translate(input)).toEqual(result);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(peak).toBe(2);
    } finally {
      release();
      pipeline.dispose();
      await pipeline.drain();
    }
  });
  it('无效分析只使用原有三次预算，不串行拆句继续分析', async () => {
    const fetch = vi.fn(async () => completion('格式错误'));
    vi.stubGlobal('fetch', fetch);
    const translator = await createTranslator(config);
    await expect(
      attemptTranslation(translator, {
        lines: [JSON.stringify(sample)],
        context: { purpose: 'glossary' },
      }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(TRANSLATION_RETRIES);
  });
  it('分析缓存与正文、协议和思考参数隔离', async () => {
    const normal = await createTranslator(config);
    const high = await createTranslator({
      ...config,
      profile: { id: 'openai', values: { reasoning_effort: 'high' } },
    });
    const input = {
      lines: [JSON.stringify(sample)],
      context: { purpose: 'glossary' as const },
    };
    expect(normal.getCacheKey?.(input)).not.toBe(
      normal.getCacheKey?.({ lines: input.lines }),
    );
    expect(normal.getCacheKey?.(input)).not.toBe(high.getCacheKey?.(input));
  });
});
