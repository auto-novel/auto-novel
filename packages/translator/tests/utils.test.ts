import { describe, expect, it } from 'vitest';
import { filterGlossaryForLines } from '../src/utils';
import {
  isPassthroughLine,
  mergeTranslatedLines,
  splitPassthroughLines,
  validateTranslationLines,
  postprocessTranslationLines,
} from '../src/pipeline/lines';
import { createOpenAiPromptBuilder } from '../src/translator/llm-prompt';
import { createSakuraPromptBuilder } from '../src/translator/sakura-prompt';

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

  it.each([
    ['　「こんにちは」', '你好', '　「你好」'],
    ['『こんにちは』', '你好', '『你好』'],
    ['“こんにちは”', '你好', '“你好”'],
    ['‘こんにちは’', '你好', '‘你好’'],
    ['"こんにちは"', '你好', '"你好"'],
    ['「こんにちは」', '「你好', '「你好」'],
    ['「こんにちは」', '你好」', '「你好」'],
    ['「こんにちは」', '“你好”', '“你好”'],
    ['「こんにちは」', '“你好', '“你好”'],
    ['「こんにちは」', '你好”', '“你好”'],
    ['「こんにちは', '你好', '你好'],
    ['こんにちは」', '你好', '你好'],
    ['「こんにちは', '“你好', '“你好'],
    ['こんにちは」', '你好”', '你好”'],
    ['「こんにちは」', '"你好', '"你好"'],
    ['「こんにちは」', '你好"', '"你好"'],
    ['「はい」と彼は言った', '他说：“是的。”', '他说：“是的。”'],
    ['彼は言った。「はい」', '“是的。”他说。', '“是的。”他说。'],
    ['「好きな言葉は『希望』」', '最喜欢的词是“希望”', '最喜欢的词是“希望”'],
    [
      '「はい」と彼は言った。「いいえ」',
      '是的，他说。不。',
      '是的，他说。不。',
    ],
    ['「こんにちは」「さようなら」', '你好，再见', '你好，再见'],
    ['"はい"と彼は言った。"いいえ"', '是的，他说。不。', '是的，他说。不。'],
    ['「『こんにちは」', '你好', '你好'],
    ['「『こんにちは』」', '你好', '「你好」'],
    ['「こんにちは」', '“他说‘你好’”', '“他说‘你好’”'],
    ['「こんにちは」', '“他说‘你好’', '“他说‘你好’”'],
    ['「こんにちは」', '他说‘你好’”', '“他说‘你好’”'],
    ['「こんにちは」', '“他说‘你好”', '“他说‘你好”'],
    ['「こんにちは」', '“他说‘你好”’', '“他说‘你好”’'],
    ['「こんにちは」', '他说“你好', '他说“你好'],
    ['「こんにちは」', '你好”他说', '你好”他说'],
    ['「こんにちは」', '你好」「世界', '你好」「世界'],
    ['\t「こんにちは」　', '  你好 \t', '\t「你好」 \t'],
    ['（こんにちは）', '你好', '你好'],
    ['こんにちは', '“你好”', '“你好”'],
    ['彼は「こんにちは」と言った', '他说你好', '他说你好'],
  ])(
    '恢复缺失引号且重复处理不变：%s / %s',
    (original, translated, expected) => {
      const result = postprocessTranslationLines([original], [translated]);
      expect(result).toEqual([expected]);
      expect(postprocessTranslationLines([original], result)).toEqual(result);
      expect(mergeTranslatedLines([original], [0], [translated])).toEqual(
        result,
      );
    },
  );

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
      createOpenAiPromptBuilder().parseAnswer('#2:另一译文\n#1:译文', [
        '原文',
        '另一行',
      ]),
    ).toEqual(['译文', '另一译文']);
  });

  it('Sakura 清除结束标记并统一换行，批量解析保留行边界', () => {
    const answer = '译文一\r\n译文二\r译文三<|im_end|>';
    expect(createSakuraPromptBuilder('1.0').parseAnswer(answer, [])).toEqual([
      '译文一',
      '译文二',
      '译文三',
    ]);
  });
});
