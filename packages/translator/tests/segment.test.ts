import { describe, it, expect } from 'vite-plus/test';
import { assembleSegments, createLineSegmenter } from '../src/pipeline/segment';
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

  it('行数超过 upperLine 时触发分段', () => {
    const segmenter = createLineSegmenter(undefined, 2);
    const lines = ['a', 'b', 'c'];
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('字符数限制优先于行数限制', () => {
    const segmenter = createLineSegmenter(10, 100);
    const lines = ['12345', '67890', 'abc'];
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
  });

  it('超长单行单独成段后，后续行正常合并', () => {
    const segmenter = createLineSegmenter(5);
    const lines = ['helloo', 'a', 'b'];
    expect(segmenter.segment(lines)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
  });

  it('所有行刚好填满 upperLen 时不分段', () => {
    const segmenter = createLineSegmenter(11);
    // 三行共 9 字符与 2 个换行，恰好等于上限。
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
// assembleSegments 测试
// ============================================================
describe('assembleSegments', () => {
  const id = 'test-id';

  const makeRanges = (
    ...pairs: [number, number][]
  ): { start: number; end: number }[] =>
    pairs.map(([start, end]) => ({ start, end }));

  it('应正确组装基本 Segment', () => {
    const lines = ['hello', 'world', 'foo'];
    const ranges = makeRanges([0, 2], [2, 3]);

    const segments = assembleSegments(id, lines, ranges, {});

    expect(segments).toHaveLength(2);

    // 第一个段
    expect(segments[0].id).toBe(id);
    expect(segments[0].order).toBe(0);
    expect(segments[0].lines).toEqual(['hello', 'world']);
    expect(segments[0].context?.glossary).toEqual({});
    expect(segments[0].context?.expired).toBe(true);
    expect(segments[0].context?.history).toBeUndefined();

    // 第二个段
    expect(segments[1].id).toBe(id);
    expect(segments[1].order).toBe(1);
    expect(segments[1].lines).toEqual(['foo']);
    expect(segments[1].context?.glossary).toEqual({});
    expect(segments[1].context?.expired).toBe(true);
  });

  it('应过滤 glossary，只保留当前段行中出现的词条', () => {
    const lines = ['hello world', 'foo bar', 'baz'];
    const ranges = makeRanges([0, 2], [2, 3]);
    const glossary: Glossary = {
      hello: '你好',
      world: '世界',
      missing: '不存在的',
      baz: '巴兹',
    };

    const segments = assembleSegments(id, lines, ranges, glossary);

    // 段0: ['hello world', 'foo bar'] => 包含 hello, world
    expect(segments[0].context?.glossary).toEqual({
      hello: '你好',
      world: '世界',
    });

    // 段1: ['baz'] => 包含 baz
    expect(segments[1].context?.glossary).toEqual({
      baz: '巴兹',
    });
  });

  it('有 history 且原文和术语表一致时 expired 为 false', () => {
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    };

    const segments = assembleSegments(id, lines, ranges, glossary, history);

    expect(segments[0].context?.expired).toBe(false);
    expect(segments[0].context?.history).toEqual({
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    });
  });

  it('有 history 但原文不一致时 expired 为 true', () => {
    const lines = ['hello', 'changed'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'], // 原文不同
      translatedLines: ['你好', '世界'],
      glossary: { hello: '你好' },
    };

    const segments = assembleSegments(id, lines, ranges, glossary, history);

    expect(segments[0].context?.expired).toBe(true);
    // history 仍然保留旧数据
    expect(segments[0].context?.history?.lines).toEqual(['hello', 'world']);
  });

  it('当前段未变但前文已变时，历史译文仍须过期', () => {
    const history: TranslationHistory = {
      lines: ['旧前文', '当前段'],
      translatedLines: ['旧译文', '当前译文'],
      glossary: {},
    };
    const [segment] = assembleSegments(
      id,
      ['新前文', '当前段'],
      makeRanges([1, 2]),
      {},
      history,
    );

    expect(segment.context?.previousSource).toBe('新前文');
    expect(segment.context?.expired).toBe(true);
    expect(segment.context?.history?.translatedLines).toEqual(['当前译文']);
  });

  it('有 history 但术语表不一致时 expired 为 true', () => {
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好', world: '世界' };

    const history: TranslationHistory = {
      lines: ['hello', 'world'],
      translatedLines: ['你好', '世'],
      glossary: { hello: '你好' }, // 缺少 world
    };

    const segments = assembleSegments(id, lines, ranges, glossary, history);

    expect(segments[0].context?.expired).toBe(true);
  });

  it('history 的 glossary 过滤应基于当前段原文，而非历史原文', () => {
    const lines = ['hello', 'world'];
    const ranges = makeRanges([0, 2]);
    const glossary: Glossary = { hello: '你好', world: '世界' };

    const history: TranslationHistory = {
      lines: ['old', 'world'],
      translatedLines: ['旧译文', '世界'],
      glossary: { hello: '你好', world: '世界', old: '旧词', extra: '额外' },
    };

    const segments = assembleSegments(id, lines, ranges, glossary, history);

    // 历史 glossary 被过滤为只包含当前段原文中出现的词条
    expect(segments[0].context?.history?.glossary).toEqual({
      hello: '你好',
      world: '世界',
    });
  });

  it('多个段各自独立过滤 glossary 和 history', () => {
    const lines = ['cat', 'dog', 'bird'];
    const ranges = makeRanges([0, 2], [2, 3]);
    const glossary: Glossary = { cat: '猫', dog: '狗', bird: '鸟' };

    const history: TranslationHistory = {
      lines: ['cat', 'dog', 'bird'],
      translatedLines: ['猫', '狗', '鸟'],
      glossary: { cat: '猫', dog: '狗', bird: '鸟' },
    };

    const segments = assembleSegments(id, lines, ranges, glossary, history);

    // 段0: ['cat', 'dog'] => glossary 只有 cat, dog
    expect(segments[0].context?.glossary).toEqual({ cat: '猫', dog: '狗' });
    expect(segments[0].context?.history?.lines).toEqual(['cat', 'dog']);
    expect(segments[0].context?.history?.translatedLines).toEqual(['猫', '狗']);

    // 段1: ['bird'] => glossary 只有 bird
    expect(segments[1].context?.glossary).toEqual({ bird: '鸟' });
    expect(segments[1].context?.history?.lines).toEqual(['bird']);
    expect(segments[1].context?.history?.translatedLines).toEqual(['鸟']);
  });

  it('空行数组应返回空 Segment 数组', () => {
    const segments = assembleSegments(id, [], [], {});
    expect(segments).toEqual([]);
  });
});
