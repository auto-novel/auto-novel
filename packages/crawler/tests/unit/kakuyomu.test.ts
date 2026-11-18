import { readFile } from 'node:fs/promises';

import ky from 'ky';
import { describe, expect, test } from 'vite-plus/test';

import { Kakuyomu } from '@/web/kakuyomu';
import { WebNovelType } from '@/web/types';

async function createFixtureProvider(filename: string): Promise<Kakuyomu> {
  const html = await readFile(
    new URL(`../fixtures/kakuyomu/${filename}`, import.meta.url),
    'utf8',
  );
  return new Kakuyomu(
    ky.create({
      fetch: async () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    }),
  );
}

describe('kakuyomu fixtures', () => {
  test('parses 2912051601045930861', async () => {
    const provider = await createFixtureProvider(
      '2912051601045930861.260814.html',
    );

    const data = await provider.getMetadata('2912051601045930861');

    expect(data.title).toBe('因習村の怪しげな神にTS転生した話　');
    expect(data.authors).toEqual([
      {
        name: '大崎　狂花',
        link: 'https://kakuyomu.jp/users/tmtk012',
      },
    ]);
    expect(data.type).toBe(WebNovelType.Completed);
    expect(data.attentions).toEqual([]);
    expect(data.keywords).toEqual([
      'TS',
      '因習村',
      '下ネタ',
      'ギャグ',
      'コメディ',
      '日常',
      '性転換',
    ]);
    expect(data.points).toBe(25);
    expect(data.totalCharacters).toBe(30_146);
    expect(data.introduction).toContain('ギャグコメディです');
    expect(data.toc).toHaveLength(7);
    expect(data.toc[0]).toEqual({
      title: '第1話　禁　経緯',
      chapterId: '2912051601046590969',
      createAt: '2026-06-01T14:07:58.000Z',
    });
    expect(data.toc[data.toc.length - 1]).toEqual({
      title: '第7話　自分のお墓参りに行く①',
      chapterId: '2912051603770573025',
      createAt: '2026-07-10T13:54:39.000Z',
    });
  });
});
