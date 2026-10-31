import { describe, expect, it } from 'vitest';

import { createGlossaryCodec } from '../src/translator/youdao-glossary';

describe('createGlossaryCodec', () => {
  it('按最长术语优先替换，并在译文中还原', () => {
    const codec = createGlossaryCodec({
      太郎: '小太郎',
      花子: '小花',
    });
    const encoded = codec.encode(['太郎と花子']);
    expect(encoded[0]).not.toContain('太郎');
    expect(encoded[0]).not.toContain('花子');
    expect(codec.decode(encoded)).toEqual(['小太郎と小花']);
  });

  it('还原时去掉术语值里的备注', () => {
    const codec = createGlossaryCodec({ 太郎: '小太郎#男性，昵称' });
    expect(codec.decode(codec.encode(['太郎']))).toEqual(['小太郎']);
  });

  it('容忍译文丢失 $ 或插入空格', () => {
    const codec = createGlossaryCodec({ 太郎: '小太郎' });
    const encoded = codec.encode(['太郎'])[0];
    const token = encoded.slice(1);
    expect(codec.decode([encoded])).toEqual(['小太郎']);
    expect(codec.decode([`$ ${token}`])).toEqual(['小太郎']);
    expect(codec.decode([token])).toEqual(['小太郎']);
  });

  it('空术语表不改变内容', () => {
    const codec = createGlossaryCodec({});
    expect(codec.encode(['原文', '第二行'])).toEqual(['原文', '第二行']);
    expect(codec.decode(['译文', '第二行'])).toEqual(['译文', '第二行']);
  });
});
