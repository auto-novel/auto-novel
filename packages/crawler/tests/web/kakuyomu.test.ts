import ky from 'ky';
import { describe, expect, test } from 'vitest';

import { Kakuyomu } from '@/web/kakuyomu';
import { WebNovelAttention, WebNovelType } from '@/web/types';
import { client } from './utils';

test('kakuyomu: current ranking page structure', async () => {
  const html = `
    <ol class="Rankings_list__currentHash">
      <li class="Rankings_item__currentHash">
        <h3>
          <a title="完整的作品标题" href="/works/1177354054891139802">被截断的作品标题…</a>
          <a href="/users/example">作者</a>
        </h3>
        <ul class="Meta_meta__currentHash Meta_disc__currentHash">
          <li>★73,252</li>
          <li>异世界幻想</li>
          <li>连载中 748话</li>
        </ul>
        <ul class="Meta_meta__currentHash Meta_slash__currentHash">
          <li>残酷描写有り</li>
          <li>暴力描写有り</li>
        </ul>
        <ul class="Meta_meta__currentHash Meta_slash__currentHash">
          <li><a href="/tags/TS">TS</a></li>
          <li><a href="/tags/fantasy">剑与魔法</a></li>
        </ul>
      </li>
    </ol>
  `;
  const provider = new Kakuyomu(
    ky.create({
      fetch: async () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    }),
  );

  const data = await provider.getRank({
    genre: '综合',
    range: '总计',
    status: '全部',
  });

  expect(data.items).toEqual([
    {
      novelId: '1177354054891139802',
      title: '完整的作品标题',
      attentions: [WebNovelAttention.Cruelty, WebNovelAttention.Violence],
      keywords: ['TS', '剑与魔法'],
      extra: '★73,252 / 异世界幻想 / 连载中 748话',
    },
  ]);
});

describe('kakuyomu', () => {
  const provider = new Kakuyomu(client);

  test('rank', async () => {
    const data = await provider.getRank({
      genre: '综合',
      range: '总计',
      status: '全部',
    });
    expect(data?.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
  });

  test('metadata', async () => {
    // TS衛生兵さんの成り上がり
    // https://kakuyomu.jp/works/16818093075963348153
    const novelId = '16818093075963348153';

    const data = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('TS衛生兵さんの成り上がり');
    expect(data?.type).toBe(WebNovelType.Completed);
    expect(data?.attentions).toEqual([]);
    expect(data?.keywords.join('\n')).contain('無表情敬語調貧乳女兵士');
    expect(data?.keywords.join('\n')).contain('TS');
    expect(data?.introduction).toBeDefined();
    expect(data?.toc?.[0]?.title).contain('西部戦線');
  });

  test('chapter', async () => {
    // TS衛生兵さんの成り上がり
    // https://kakuyomu.jp/works/16818093075963348153
    const novelId = '16818093075963348153';
    const chapterId = '16818093075963352409';

    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('二次元の世界では');
  });
});
