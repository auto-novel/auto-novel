import { readFile } from 'node:fs/promises';

import ky from 'ky';
import { describe, expect, test } from 'vitest';

import { Alphapolis } from '@/web/alphapolis';
import { WebNovelAttention, WebNovelType } from '@/web/types';
import { client } from './utils';

async function createFixtureProvider(filename: string): Promise<Alphapolis> {
  const html = await readFile(
    new URL(`../fixtures/alphapolis/${filename}`, import.meta.url),
    'utf8',
  );
  return new Alphapolis(
    ky.create({
      fetch: async () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    }),
  );
}

describe('alphapolis fixtures', () => {
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

const shouldSkip = !process.env.ALL_TEST;
describe.skipIf(shouldSkip)('alphapolis', () => {
  const provider = new Alphapolis(
    client.extend({
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US',
        'Accept-Encoding': 'gzip, deflate, br, zstd',

        Cookie:
          '823acvandu8=; ga1e74ugjok=; AWSALB=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; AWSALBCORS=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; XSRF-TOKEN=eyJpdiI6IjI5aklNOFVIZ0lDcGh5NlJqMFZOV0E9PSIsInZhbHVlIjoiQi8xYjJBSTNYbVBWMHY5U3kwdDJlOVRlbVF0blFIY05jQWRXWDVmZm9Rc0E1UGdRc25WNXpwU1VGZ3QxVm5EMFVXYTg3ZDR0NUd0bDk2V0ZEczF4QU81YXRRT0NEV1p3aUduamtqWDhjbGVZODFQQVVUOWZKRzFXR3psR3dneUQiLCJtYWMiOiI1MDdmNzY4NDgxOTk3M2Y0ZmMyYjNiYTFjODQ1YzhlYmM3NmE2ZDA5OTcyZDMwYTE0NDFkMWI2NDU4MDk1MjVjIiwidGFnIjoiIn0%3D; alpl_v2_front_session=eyJpdiI6ImRSU3hQN01YNk1LSTZaclNOT3l5VlE9PSIsInZhbHVlIjoidlFWLzNYVU5UK2tSMmYwLzBMc00vajZ5R0pobksxS1Bwc0QyUVNwSUlNbFJzdi83Y0w5R0FwWXRFQW5RRjBWc1J0OW5zT1hQUTBoOVBhZk9VbGFMWlhMdSs5Znp6RDhQVVFtUmVQUEdxdnJuQUNaMkNyTms1bzRDcVIrU2NuTVgiLCJtYWMiOiJmZDE5ZDk5YzdiY2JmNzNiOGM5MjhlMWZhNGExMDkzYWNkMGRjNzA4MzkwNDRjZTVhYWM2MmUzYzhjMmYyMjE4IiwidGFnIjoiIn0%3D; device_uuid=eyJpdiI6IlNjM2NNdmxTTDE3OWRPbk45RkF5REE9PSIsInZhbHVlIjoib2dmcnNueUM0cDAycXgxejFwc05aVDBDUU9FeGpMbUxFSUFKZkkxSldjSWR5Z3QvYkJ6ZExoQ0NBQ0Q4QWFERUJYaFZYZGRuWEJGQkhSN3hNWlIrUjJ1bHlwVTJiejNuV1J0NTBuSHdmT2c9IiwibWFjIjoiYjcwODA1NDM1NjBiZjhjYzZiMzM2OTdjYjFiMDE4YTdhZmQ1ZDgwZGJiZTQyMTM1MDUyYjBjZGVkZDRmYWJkMyIsInRhZyI6IiJ9; krt_rewrite_uid=a87ff6ca-84ea-47e5-afa2-17eed43e4826; twtr_pixel_opt_in=N; aws-waf-token=41b61326-cf35-4a29-bacd-0f6264247bd7:AQoAdcQy2TXrAAAA:P9AOyR69CQryJtoy8FOh0ViT1hilKsxaCJxSJMp04AdanowlucZleAtlt45fLTGU5nEbhmkKfz2uWYc+lM0Wwp4TE++VDtYKErjv1Jg/f80nCugI8AYM5gurkRBCgp0fNWqWiIeXqfD4/Z781AO7WviOMKSkKJxOOmHHxOCHH3YjQAAVuxgCV2IgVrKlTljpHq8zjKw=',
      },
    }),
  );

  test('metadata', async () => {
    // TSして魔法少女になった俺は、ダンジョンをカワイく攻略配信する～ダンジョン配信は今、カワイイの時代へ～
    // https://www.alphapolis.co.jp/novel/482159232/437919648
    const novelId = '482159232-437919648';

    const data = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe(
      'TSして魔法少女になった俺は、ダンジョンをカワイく攻略配信する～ダンジョン配信は今、カワイイの時代へ～',
    );
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toEqual([]);
    expect(data?.keywords.join('\n')).contain('TS');
    expect(data?.keywords.join('\n')).contain('魔法少女');
    expect(data?.introduction).toBeDefined();
    const titles = data?.toc?.map((it) => it.title).join('\n');
    expect(titles).contain('お前が魔法少女になるんだよ');
  });

  test('chapter', async () => {
    console.warn('️⚠️ Alphapolis 有严格的反爬策略，爬取章节必须提供 cookies');

    // TSして魔法少女になった俺は、ダンジョンをカワイく攻略配信する～ダンジョン配信は今、カワイイの時代へ～
    // https://www.alphapolis.co.jp/novel/482159232/437919648
    const novelId = '482159232-437919648';
    const chapterId = '9003705';

    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('だからお前が魔法少女に変身して魔法を使うんだよ');
  });
});
