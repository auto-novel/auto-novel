import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Pixiv } from '@/domain/pixiv.ts';

import {
  WebNovelAttention,
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.ts';

describe('pixiv-single', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // mygo-污秽不堪的我
  // https://www.pixiv.net/novel/show.php?id=20701222
  const novelId = 's20701222';
  let provider: Pixiv;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    const client = buildClientForTest();
    provider = new Pixiv(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('mygo-污秽不堪的我');
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toEqual([]);
    expect(data?.keywords.join('\n')).contain('千早愛音');
    expect(data?.keywords.join('\n')).contain('MyGO!!!!!');
    expect(data?.introduction).toBeDefined();
    const titles = data?.toc?.map((it) => it.title).join('\n');
    expect(titles).contain('无名');
  });

  test('chapter', async () => {
    const chapterId = '20701222';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('一辈子，呵。');
  });
});

describe('pixiv-series', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // 若叶睦死于傍晚的盛夏
  // https://www.pixiv.net/novel/series/10999474
  const novelId = '10999474';
  let provider: Pixiv;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    const client = buildClientForTest();
    provider = new Pixiv(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('若叶睦死于傍晚的盛夏');
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toEqual([]);
    expect(data?.keywords.join('\n')).contain('MyGO!!!!!');
    expect(data?.keywords.join('\n')).contain('百合');
    expect(data?.introduction).toBeDefined();
    const titles = data?.toc?.map((it) => it.title).join('\n');
    expect(titles).contain('第一章');
  });

  test('chapter', async () => {
    const chapterId = '20701185';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('若叶睦，已经死于这傍晚的盛夏。');
  });
});
