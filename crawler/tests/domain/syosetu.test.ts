import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Syosetu } from '@/domain/syosetu.ts';

import {
  WebNovelAttention,
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.ts';

describe('syosetu', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // 魔法少女がいく～TS魔法少女は運が悪いようです～
  // https://ncode.syosetu.com/n3553ie
  const novelId = 'n3553ie';
  let provider: Syosetu;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    const client = buildClientForTest();
    provider = new Syosetu(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('魔法少女がいく～TS魔法少女は運が悪いようです～');
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toContain(WebNovelAttention.R15);
    expect(data?.attentions).toContain(WebNovelAttention.Cruelty);
    expect(data?.keywords.join('\n')).contain('TS');
    expect(data?.keywords.join('\n')).contain('魔法少女');
    expect(data?.introduction).toBeDefined();
    const titles = data?.toc?.map((it) => it.title).join('\n');
    expect(titles).contain('1人ぼっちの魔法少女');
  });

  test('chapter', async () => {
    const chapterId = '2';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('はぁ、変身');
  });
});
