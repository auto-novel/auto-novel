import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Hameln } from '@/domain/hameln.ts';

import {
  WebNovelAttention,
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.js';

describe('hameln', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // ts転生者の生徒が、頑張るだけのお話。
  // https://syosetu.org/novel/320297/
  const novelId = '320297';
  let provider: Hameln;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    const client = buildClientForTest();
    provider = new Hameln(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
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
    const chapterId = '174';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('お疲れ様、先生');
  });
});
