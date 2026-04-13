import { describe, expect, test } from 'vitest';

import { Syosetu } from '@/provider/syosetu';
import { WebNovelAttention, WebNovelType } from '@/provider/types';

import { client } from './utils';

describe('syosetu', () => {
  const provider = new Syosetu(client);

  test('metadata', async () => {
    // 魔法少女がいく～TS魔法少女は運が悪いようです～
    // https://ncode.syosetu.com/n3553ie
    const novelId = 'n3553ie';

    const data = await provider.getMetadata(novelId);
    expect(data).toBeTruthy();
    expect(data?.title).toBe('魔法少女がいく～TS魔法少女は運が悪いようです～');
    expect(data?.authors).toHaveLength(1);
    expect(data?.authors[0].name).toBe('ココア');
    expect(data?.type).toBe(WebNovelType.Completed);
    expect(data?.attentions).toContain(WebNovelAttention.R15);
    expect(data?.attentions).toContain(WebNovelAttention.Cruelty);
    expect(data?.keywords).toContain('TS');
    expect(data?.keywords).toContain('魔法少女');
    expect(data?.totalCharacters).toBeGreaterThan(100000);
    expect(data?.introduction.length).toBeGreaterThan(100);
    expect(data?.toc.length).toBeGreaterThan(10);
    expect(data?.toc[0].chapterId).toBe('1');
    expect(data?.toc[0].title).toBe('爆炎に包まれ現れる新たな魔法少女');
    console.log(data?.points);
    console.log(data?.toc[0].createAt);
  });

  test.skip('chapter', async () => {
    // 魔法少女がいく～TS魔法少女は運が悪いようです～
    // https://ncode.syosetu.com/n3553ie/2
    const novelId = 'n3553ie';
    const chapterId = '2';

    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data?.paragraphs.join('\n');
    expect(text).toContain('はぁ、変身');
  });
});
