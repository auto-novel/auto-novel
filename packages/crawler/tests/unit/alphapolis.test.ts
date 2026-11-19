import { readFile } from 'node:fs/promises';

import ky from 'ky';
import { describe, expect, test } from 'vite-plus/test';

import { Alphapolis } from '@/web/alphapolis';
import { WebNovelAttention, WebNovelType } from '@/web/types';

async function createFixtureProvider(
  filename: string,
  transformHtml = (html: string) => html,
): Promise<Alphapolis> {
  const html = await readFile(
    new URL(`../fixtures/alphapolis/${filename}`, import.meta.url),
    'utf8',
  );
  return new Alphapolis(
    ky.create({
      fetch: async () =>
        new Response(transformHtml(html), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    }),
  );
}

describe('alphapolis fixtures', () => {
  test('skips locked episodes without losing later free episodes', async () => {
    const provider = await createFixtureProvider('rental.html');

    const data = await provider.getMetadata('6072941-154068823');

    expect(data.toc).toEqual([
      {
        title: '1巻',
        chapterId: null,
        createAt: '2017-05-25T02:34:00.000Z',
      },
      {
        title: '1-1',
        chapterId: '481468',
        createAt: '2017-05-25T02:34:00.000Z',
      },
      {
        title: '首话锁定',
        chapterId: null,
        createAt: '2017-05-25T02:35:00.000Z',
      },
      {
        title: '公开话',
        chapterId: '481486',
        createAt: '2017-05-25T02:35:00.000Z',
      },
      {
        title: '連載',
        chapterId: null,
        createAt: '2017-01-13T11:54:00.000Z',
      },
      {
        title: '番外編　とある傭兵の恋',
        chapterId: '165163',
        createAt: '2017-01-13T11:54:00.000Z',
      },
    ]);
  });

  test.each(['null', '"invalid-date"'])(
    'still rejects invalid public episode timestamps: %s',
    async (timestamp) => {
      const provider = await createFixtureProvider('rental.html', (html) =>
        html.replace('"2017.05.25 11:34"', timestamp),
      );

      await expect(provider.getMetadata('6072941-154068823')).rejects.toThrow(
        /发布时间/,
      );
    },
  );

  test('parses 702113882-606570085', async () => {
    const provider = await createFixtureProvider(
      '702113882-606570085.260811.html',
    );

    const data = await provider.getMetadata('702113882-606570085');

    expect(data.title).toBe(
      '間違い転生！！〜神様の加護をたくさん貰っても それでものんびり自由に生きたい〜',
    );
    expect(data.authors).toEqual([
      {
        name: '舞桜',
        link: 'https://www.alphapolis.co.jp/author/detail/702113882',
      },
    ]);
    expect(data.type).toBe(WebNovelType.Ongoing);
    expect(data.attentions).toEqual([]);
    expect(data.keywords).toContain('異世界転生チート');
    expect(data.points).toBe(9_969_050);
    expect(data.totalCharacters).toBe(3_505_100);
    expect(data.introduction).toContain('神様の手違いにより死亡扱い');
    expect(data.toc.slice(0, 3)).toEqual([
      {
        title: 'プロローグ',
        chapterId: null,
        createAt: '2022-01-13T13:07:00.000Z',
      },
      {
        title: '転生',
        chapterId: '5021358',
        createAt: '2022-01-13T13:07:00.000Z',
      },
      {
        title: '第1章　幼少期',
        chapterId: null,
        createAt: '2021-12-31T15:00:00.000Z',
      },
    ]);
  });

  test('parses 183268004-17064220', async () => {
    const provider = await createFixtureProvider(
      '183268004-17064220.260811.html',
    );

    const data = await provider.getMetadata('183268004-17064220');

    expect(data.title).toBe(
      '追放予定のモブ伯爵令嬢ですが、土魔法で生存ルートに入ります　～目立たず生きるつもりが、王太子から溺愛されることになりました～',
    );
    expect(data.authors).toEqual([
      {
        name: '水守真子',
        link: 'https://www.alphapolis.co.jp/author/detail/183268004',
      },
    ]);
    expect(data.type).toBe(WebNovelType.Ongoing);
    expect(data.attentions).toEqual([WebNovelAttention.R15]);
    expect(data.keywords).toEqual(['恋愛', '異世界', 'ラブコメ', '幼馴染']);
    expect(data.points).toBe(267_682);
    expect(data.totalCharacters).toBe(72_534);
    expect(data.introduction).toContain('王太子の執愛ルート');
    expect(data.toc).toHaveLength(27);
    expect(data.toc.slice(0, 2)).toEqual([
      {
        title: '第一章　モブ伯爵令嬢、生存ルートに入ります',
        chapterId: null,
        createAt: '2026-07-11T05:26:00.000Z',
      },
      {
        title: '１　ＴＫＧを知っているか',
        chapterId: '11499518',
        createAt: '2026-07-11T05:26:00.000Z',
      },
    ]);
    expect(data.toc[data.toc.length - 1]).toEqual({
      title: '２４　旅立ち',
      chapterId: '11634067',
      createAt: '2026-08-08T04:20:00.000Z',
    });
  });

  test('parses episodes without a chapter title', async () => {
    const provider = await createFixtureProvider(
      '708432796-132027823.260815.html',
    );

    const data = await provider.getMetadata('708432796-132027823');

    expect(data.title).toBe(
      '異世界転移殺人事件　～推理しない探偵は初めから犯人を知っている',
    );
    expect(data.authors).toEqual([
      {
        name: '寿　利真',
        link: 'https://www.alphapolis.co.jp/author/detail/708432796',
      },
    ]);
    expect(data.type).toBe(WebNovelType.Completed);
    expect(data.points).toBe(15_604);
    expect(data.totalCharacters).toBe(550_086);
    expect(data.toc).toHaveLength(189);
    expect(data.toc[0]).toEqual({
      title: 'プロローグ',
      chapterId: '10746799',
      createAt: '2026-01-28T00:16:00.000Z',
    });
    expect(data.toc[data.toc.length - 1]).toEqual({
      title: 'エピローグ',
      chapterId: '10937166',
      createAt: '2026-03-18T12:32:00.000Z',
    });
  });
});
