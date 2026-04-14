import { describe, it, expect } from 'vitest';
import { parseEventStream, safeJson, RegexUtil, delay } from '../src/utils';

describe('utils', () => {
  describe('parseEventStream', () => {
    it('should parse a single data line', () => {
      const stream = 'data: {"foo": "bar"}\n\n';
      const generator = parseEventStream(stream);
      const result = generator.next();
      expect(result.value).toEqual({ foo: 'bar' });
      expect(result.done).toBe(false);
      expect(generator.next().done).toBe(true);
    });

    it('should parse multiple data lines', () => {
      const stream = 'data: {"foo": "bar"}\n\ndata: {"baz": "qux"}\n\n';
      const results = [...parseEventStream(stream)];
      expect(results).toEqual([{ foo: 'bar' }, { baz: 'qux' }]);
    });

    it('should handle the [DONE] message', () => {
      const stream = 'data: {"foo": "bar"}\n\n[DONE]\n\n';
      const results = [...parseEventStream(stream)];
      expect(results).toEqual([{ foo: 'bar' }]);
    });

    it('should ignore empty lines and comments', () => {
      const stream = '\n: ping\n\ndata: {"foo": "bar"}\n\n';
      const results = [...parseEventStream(stream)];
      expect(results).toEqual([{ foo: 'bar' }]);
    });

    it('should handle invalid JSON gracefully', () => {
      const stream = 'data: not json\n\ndata: {"foo": "bar"}\n\n';
      const results = [...parseEventStream(stream)];
      expect(results).toEqual([{ foo: 'bar' }]);
    });
  });

  describe('safeJson', () => {
    it('should parse a valid JSON string', () => {
      const json = '{"a": 1}';
      expect(safeJson(json)).toEqual({ a: 1 });
    });

    it('should return undefined for an invalid JSON string', () => {
      const json = 'not json';
      expect(safeJson(json)).toBeUndefined();
    });
  });

  describe('RegexUtil', () => {
    it('hasEnglishChars', () => {
      expect(RegexUtil.hasEnglishChars('hello')).toBe(true);
      expect(RegexUtil.hasEnglishChars('你好')).toBe(false);
      expect(RegexUtil.hasEnglishChars('こんにちは')).toBe(false);
    });

    it('hasHanzi', () => {
      expect(RegexUtil.hasHanzi('你好')).toBe(true);
      expect(RegexUtil.hasHanzi('hello')).toBe(false);
    });

    it('hasKanaChars', () => {
      expect(RegexUtil.hasKanaChars('こんにちは')).toBe(true);
      expect(RegexUtil.hasKanaChars('hello')).toBe(false);
    });

    it('hasHangulChars', () => {
      expect(RegexUtil.hasHangulChars('안녕하세요')).toBe(true);
      expect(RegexUtil.hasHangulChars('hello')).toBe(false);
    });
  });

  describe('delay', () => {
    it('should resolve after the given time', async () => {
      const start = Date.now();
      await delay(50);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(49);
    });

    it('should be abortable', async () => {
      const controller = new AbortController();
      const promise = delay(100, controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow('Aborted');
    });
  });
});
