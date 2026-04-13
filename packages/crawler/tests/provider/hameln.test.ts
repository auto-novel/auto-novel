import { describe, expect, test } from 'vitest';

import { Hameln } from '@/provider/hameln';

import { WebNovelAttention, type RemoteChapter } from '@/provider/types';
import { client } from './utils';

describe('hameln', () => {
  const provider = new Hameln(client);

  test('metadata', async () => {
    // ts転生者の生徒が、頑張るだけのお話。
    // https://syosetu.org/novel/320297/
    const novelId = '320297';

    const data = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('ts転生者の生徒が、頑張るだけのお話。');
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toContain(WebNovelAttention.R15);
    expect(data?.attentions).toContain(WebNovelAttention.Cruelty);
    expect(data?.keywords.join('\n')).contain('TS');
    expect(data?.keywords.join('\n')).contain('性転換');
    expect(data?.keywords.join('\n')).contain('ブルーアーカイブ');
    expect(data?.introduction).toBeDefined();
    const titles = data?.toc?.map((it) => it.title).join('\n');
    expect(titles).contain('きっとこれからも、頑張るだけのお話');
  });

  test('chapter', async () => {
    // ts転生者の生徒が、頑張るだけのお話。
    // https://syosetu.org/novel/320297/
    const novelId = '320297';
    const chapterId = '174';

    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('お疲れ様、先生');
  });
});
