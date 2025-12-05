import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Novelup } from '@/domain/novelup.ts';
import {
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.ts';

describe('novelup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // 俺が魔法少女になるんだよ！
  // https://novelup.plus/story/634490929
  const novelId = '634490929';
  let provider: Novelup;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    const client = buildClientForTest();
    provider = new Novelup(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
    expect(data).toBeDefined();
    expect(data?.title).toBe('俺が魔法少女になるんだよ！');
    expect(data?.type).toBeDefined();
    expect(data?.attentions).toEqual([]);
    expect(data?.keywords.join('\n')).contain('TS');
    expect(data?.keywords.join('\n')).contain('魔法少女');
    expect(data?.introduction).toBeDefined();
    expect(data?.toc?.[1]?.title).contain('Are You "Lady"');
  });

  test('chapter', async () => {
    const chapterId = '248478336';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('魔法少女がいるのだから');
  });
});
