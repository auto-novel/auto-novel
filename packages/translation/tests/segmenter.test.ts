import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSegmentAssembler, createLineSegmenter } from '../src/segment';
import type { Glossary, TranslationHistory } from '../src/types';

// ============================================================
// createLineSegmenter 测试
// ============================================================
describe('createLineSegmenter', () => {
  it('空数组应返回空数组', () => {
    const segmenter = createLineSegmenter();
    expect(segmenter.segment([])).toEqual([]);
  });

  it('默认参数下，所有行应合并为一个段', () => {
    const segmenter = createLineSegmenter();
    const lines = ['a', 'b', 'c'];
    expect(segmenter.segment(lines)).toEqual([{ start: 0, end: 3 }]);
  });

  it('单行长度超过 upperLen 时，该行单独成段', () => {
    // maxLength = 5，第一行 "hello" 长度 5，加上换行符 1 => 6 > 5
    const segmenter = createLineSegmenter(5);
    const lines = ['hello', 'world'];
    // i=0: lineLen=5+1=6, segChars(0)+6=6 >5, 且 i>segStart(0) 不成立，所以不切
    // segChars=6
    // i=1: lineLen=5+0=5(最后一行), segChars(6)+5=11 >5, 且 i>segStart(0) 成立 => 切 [0,1)
    // segStart=1, segChars=5
    // 最后 push [1,2)
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
  });

  it('行数超过 upperLine 时触发分段', () => {
    // maxLine = 2，3 行文本
    const segmenter = createLineSegmenter(undefined, 2);
    const lines = ['a', 'b', 'c'];
    // i=0: segChars=1, i-segStart=0 < 2
    // i=1: segChars=1+2=3, i-segStart=1 < 2
    // i=2: segChars=3+1=4, i-segStart=2 >= 2 且 i>segStart => 切 [0,2)
    // segStart=2, segChars=1
    // 最后 push [2,3)
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('字符数限制优先于行数限制', () => {
    // maxLength=10, maxLine=100
    const segmenter = createLineSegmenter(10, 100);
    const lines = ['12345', '67890', 'abc'];
    // i=0: lineLen=5+1=6, segChars=6
    // i=1: lineLen=5+1=6, segChars(6)+6=12 >10 且 i>segStart => 切 [0,1)
    // segStart=1, segChars=6
    // i=2: lineLen=3+0=3, segChars(6)+3=9 <=10, 不切
    // 最后 push [1,3)
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
  });

  it('超长单行单独成段后，后续行正常合并', () => {
    const segmenter = createLineSegmenter(5);
    const lines = ['hello', 'a', 'b'];
    // i=0: lineLen=6 >5, 但 i===segStart 不切, segChars=6
    // i=1: lineLen=1+1=2, segChars(6)+2=8 >5, i>segStart => 切 [0,1)
    // segStart=1, segChars=2
    // i=2: lineLen=1+0=1, segChars(2)+1=3 <=5, 不切
    // 最后 push [1,3)
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
  });

  it('自定义 maxLength 和 maxLine 同时生效', () => {
    const segmenter = createLineSegmenter(20, 3);
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const result = segmenter.segment(lines);
    // 每行长度 5，加换行符 6，3 行约 18 字符 < 20，所以按行数 3 切
    expect(result).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 9 },
      { start: 9, end: 10 },
    ]);
  });

  it('所有行刚好填满 upperLen 时不分段', () => {
    const segmenter = createLineSegmenter(12);
    // "abc" (3) + 换行(1) = 4, 三行共 12，刚好等于 upperLen
    const lines = ['abc', 'abc', 'abc'];
    expect(segmenter.segment(lines)).toEqual([{ start: 0, end: 3 }]);
  });

  it('所有行刚好超过 upperLen 时触发分段', () => {
    const segmenter = createLineSegmenter(10);
    const lines = ['abc', 'abc', 'abc'];
    // 3行: (3+1)+(3+1)+(3+0) = 11 > 10, i=2 时触发
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ]);
  });
});

// ============================================================
// createSegmentAssembler 测试
// ============================================================
describe('createSegmentAssembler', () => {
  const id = 'test-id';
  const onComplete = vi.fn();
  const onError = vi.fn();

  const makeRanges = (
    ...pairs: [number, number][]
  ): { start: number; end: number }[] =>
    pairs.map(([start, end]) => ({ start, end }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应正确组装基本 Segment', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello', 'world', 'foo'];
    const ranges = makeRanges([0, 2], [2, 3]);

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      {},
      onComplete,
      onError,
    );

    expect(segments).toHaveLength(2);

    // 第一个段
    expect(segments[0].id).toBe(id);
    expect(segments[0].order).toBe(0);
    expect(segments[0].lines).toEqual(['hello', 'world']);
    expect(segments[0].context.glossary).toEqual({});
    expect(segments[0].context.expired).toBe(true);
    expect(segments[0].context.history).toBeUndefined();
    expect(segments[0].onComplete).toBe(onComplete);
    expect(segments[0].onError).toBe(onError);

    // 第二个段
    expect(segments[1].id).toBe(id);
    expect(segments[1].order).toBe(1);
    expect(segments[1].lines).toEqual(['foo']);
    expect(segments[1].context.glossary).toEqual({});
    expect(segments[1].context.expired).toBe(true);
  });

  it('应过滤 glossary，只保留当前段行中出现的词条', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello world', 'foo bar', 'baz'];
    const ranges = makeRanges([0, 2], [2, 3]);
    const glossary: Glossary = {
      hello: '你好',
      world: '世界',
      missing: '不存在的',
      baz: '巴兹',
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
    );

    // 段0: ['hello world', 'foo bar'] => 包含 hello, world
    expect(segments[0].context.glossary).toEqual({
      hello: '你好',
      world: '世界',
    });

    // 段1: ['baz'] => 包含 baz
    expect(segments[1].context.glossary).toEqual({
      baz: '巴兹',
    });
  });

  it('无 history 时所有段 expired 为 true', () => {
    const assembler = createSegmentAssembler();
    const segments = assembler.assemble(
      id,
      ['a', 'b'],
      makeRanges([0, 2]),
      {},
      onComplete,
      onError,
    );

    expect(segments[0].context.expired).toBe(true);
    expect(segments[0].context.history).toBeUndefined();
  });

  it('有 history 且原文和术语表一致时 expired 为 false', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
      history,
    );

    expect(segments[0].context.expired).toBe(false);
    expect(segments[0].context.history).toEqual({
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    });
  });

  it('有 history 但原文不一致时 expired 为 true', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello', 'changed'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'], // 原文不同
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
      history,
    );

    expect(segments[0].context.expired).toBe(true);
    // history 仍然保留旧数据
    expect(segments[0].context.history?.lines).toEqual(['hello', 'world']);
  });

  it('有 history 但术语表不一致时 expired 为 true', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好', world: '世界' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世'],
      glossary: { hello: '你好' }, // 缺少 world
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
      history,
    );

    expect(segments[0].context.expired).toBe(true);
  });

  it('history 的 glossary 过滤应基于当前段原文，而非历史原文', () => {
    const assembler = createSegmentAssembler();
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好', world: '世界' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好', world: '世界', extra: '额外' }, // 历史 glossary 有额外词条
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
      history,
    );

    // 历史 glossary 被过滤为只包含当前段原文中出现的词条
    expect(segments[0].context.history?.glossary).toEqual({
      hello: '你好',
      world: '世界',
    });
    // extra 被过滤掉，因为当前段原文不包含 'extra'
    expect(segments[0].context.history?.glossary).not.toHaveProperty('extra');
  });

  it('多个段各自独立过滤 glossary 和 history', () => {
    const assembler = createSegmentAssembler();
    const lines = ['cat', 'dog', 'bird'];
    const ranges = makeRanges([0, 2], [2, 3]);
    const glossary: Glossary = { cat: '猫', dog: '狗', bird: '鸟' };

    const history: TranslationHistory = {
      lines: ['cat', 'dog', 'bird'],
      translatedLines: ['猫', '狗', '鸟'],
      glossary: { cat: '猫', dog: '狗', bird: '鸟' },
    };

    const segments = assembler.assemble(
      id,
      lines,
      ranges,
      glossary,
      onComplete,
      onError,
      history,
    );

    // 段0: ['cat', 'dog'] => glossary 只有 cat, dog
    expect(segments[0].context.glossary).toEqual({ cat: '猫', dog: '狗' });
    expect(segments[0].context.history?.lines).toEqual(['cat', 'dog']);
    expect(segments[0].context.history?.translatedLines).toEqual(['猫', '狗']);

    // 段1: ['bird'] => glossary 只有 bird
    expect(segments[1].context.glossary).toEqual({ bird: '鸟' });
    expect(segments[1].context.history?.lines).toEqual(['bird']);
    expect(segments[1].context.history?.translatedLines).toEqual(['鸟']);
  });

  it('空行数组应返回空 Segment 数组', () => {
    const assembler = createSegmentAssembler();
    const segments = assembler.assemble(id, [], [], {}, onComplete, onError);
    expect(segments).toEqual([]);
  });

  it('空 glossary 不应影响组装', () => {
    const assembler = createSegmentAssembler();
    const segments = assembler.assemble(
      id,
      ['a'],
      makeRanges([0, 1]),
      {},
      onComplete,
      onError,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].context.glossary).toEqual({});
  });

  it('onComplete 和 onError 回调应正确传递到每个 Segment', () => {
    const assembler = createSegmentAssembler();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const segments = assembler.assemble(
      id,
      ['a', 'b'],
      makeRanges([0, 1], [1, 2]),
      {},
      cb1,
      cb2,
    );

    expect(segments[0].onComplete).toBe(cb1);
    expect(segments[0].onError).toBe(cb2);
    expect(segments[1].onComplete).toBe(cb1);
    expect(segments[1].onError).toBe(cb2);
  });
});
