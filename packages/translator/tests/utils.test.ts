import { describe, expect, it } from 'vitest';
import { detectChinese, filterGlossaryForLines } from '../src/utils';
import {
  isPassthroughLine,
  mergeTranslatedLines,
  splitPassthroughLines,
  validateTranslationLines,
  postprocessTranslationLines,
} from '../src/pipeline/lines';
import { createOpenAiPromptBuilder } from '../src/translator/llm-prompt';
import {
  cleanSakuraOutput,
  createSakuraPromptBuilder,
} from '../src/translator/sakura-prompt';

describe('translation preprocessing and postprocessing', () => {
  it('识别直通行并恢复原文布局，重复处理不改变结果', () => {
    const original = ['　原文', '  ', '<图片>https://example.test/a.jpg'];
    const translated = ['  译文', '多余内容', '图片'];
    expect(original.map(isPassthroughLine)).toEqual([false, true, true]);
    const result = postprocessTranslationLines(original, translated);
    expect(result).toEqual(['　译文', '  ', original[2]]);
    expect(postprocessTranslationLines(original, result)).toEqual(result);
    expect(translated).toEqual(['  译文', '多余内容', '图片']);
  });

  it('拒绝错行、行内换行及无效元素', () => {
    expect(() => validateTranslationLines(['原文'], [])).toThrow('行数');
    for (const line of ['译\n文', '译\r文', undefined]) {
      expect(() =>
        validateTranslationLines(['原文'], [line] as string[]),
      ).toThrow('无效内容');
    }
  });

  it('筛选当前原文出现的术语且不改变输入', () => {
    const glossary = { 太郎: '小太郎', 花子: '小花' };
    expect(filterGlossaryForLines(glossary, ['太郎です'])).toEqual({
      太郎: '小太郎',
    });
    expect(Object.keys(glossary)).toHaveLength(2);
  });

  it('拆分透传行后回填，模型只看到内容行', () => {
    const lines = ['原文', '  ', '<图片>https://example.test/a.jpg'];
    const { indexes, content } = splitPassthroughLines(lines);
    expect(content).toEqual(['原文']);
    expect(indexes).toEqual([0]);
    expect(mergeTranslatedLines(lines, indexes, ['译文'])).toEqual([
      '译文',
      '  ',
      lines[2],
    ]);
    expect(() => mergeTranslatedLines(lines, indexes, [])).toThrow('行数');
  });

  it('OpenAI 解析按编号取回每一行内容', () => {
    expect(
      createOpenAiPromptBuilder().parseAnswer('#1:译文\n#2:另一译文', [
        '原文',
        '另一行',
      ]),
    ).toEqual(['译文', '另一译文']);
  });

  it('Sakura 清除结束标记并统一换行，批量解析保留行边界', () => {
    const answer = '译文一\r\n译文二\r译文三<|im_end|>';
    expect(cleanSakuraOutput(answer)).toBe('译文一\n译文二\n译文三');
    expect(createSakuraPromptBuilder('1.0').parseAnswer(answer, [])).toEqual([
      '译文一',
      '译文二',
      '译文三',
    ]);
  });
});

describe('detectChinese', () => {
  it.each([
    'https://example.invalid/path',
    'http://example.invalid/path',
    'ttps://example.invalid/path',
    'ttp://example.invalid/path',
  ])('ignores URL %s when checking the output language', (url) => {
    const text = `这是一段足够长的中文翻译，检查译文语言识别。\n${url}`;

    expect(detectChinese(text)).toBe(true);
  });
});
