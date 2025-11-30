import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Kakuyomu } from '@/domain/kakuyomu.ts';
import {
  Page,
  RemoteNovelListItem,
  WebNovelType,
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.ts';

describe('kakuyomu', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // TS衛生兵さんの成り上がり
  // https://kakuyomu.jp/works/16818093075963348153
  const novelId = '16818093075963348153';
  let provider: Kakuyomu;

  beforeAll(() => {
    const client = buildClientForTest();
    provider = new Kakuyomu(client);
    vi.setConfig({ testTimeout });
  });

  test('rank', async () => {
    const data: Page<RemoteNovelListItem> = await provider.getRank({
      genre: '综合',
      range: '总计',
      status: '全部',
    });
    expect(data?.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
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
    const chapterId = '16818093075963352409';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('二次元の世界では');
  });
});
