import { describe, afterEach, vi, test, beforeAll, expect } from 'vitest';

import { Alphapolis } from '@/domain/alphapolis.ts';

import {
  type RemoteChapter,
  type RemoteNovelMetadata,
} from '@/domain/types.ts';
import { buildClientForTest } from './utils.js';

const shouldSkip = !process.env.ALL_TEST;
describe.skipIf(shouldSkip)('alphapolis', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const testTimeout = 10_000;

  // TSして魔法少女になった俺は、ダンジョンをカワイく攻略配信する～ダンジョン配信は今、カワイイの時代へ～
  // https://www.alphapolis.co.jp/novel/482159232/437919648
  const novelId = '482159232-437919648';
  let provider: Alphapolis;

  beforeAll(() => {
    vi.setConfig({ testTimeout });
    console.warn('⚠️ Alphapolis 有严格的反爬策略，请保证使用日本 IP 测试');
    const _client = buildClientForTest();
    const client = _client.extend({
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US',
        'Accept-Encoding': 'gzip, deflate, br, zstd',

        Cookie:
          '823acvandu8=; ga1e74ugjok=; AWSALB=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; AWSALBCORS=6mCd3SUXCQtSoA05EaYxwPhw5FuxERZq7GvUZB9mADWbEXWEyrdXUFbvqJxecBAGi/L60czryoc9X0Jy3fzv49aeUBtHbjiaTYqgSBmv4RvURC2dG9IeJAOUk/we; XSRF-TOKEN=eyJpdiI6IjI5aklNOFVIZ0lDcGh5NlJqMFZOV0E9PSIsInZhbHVlIjoiQi8xYjJBSTNYbVBWMHY5U3kwdDJlOVRlbVF0blFIY05jQWRXWDVmZm9Rc0E1UGdRc25WNXpwU1VGZ3QxVm5EMFVXYTg3ZDR0NUd0bDk2V0ZEczF4QU81YXRRT0NEV1p3aUduamtqWDhjbGVZODFQQVVUOWZKRzFXR3psR3dneUQiLCJtYWMiOiI1MDdmNzY4NDgxOTk3M2Y0ZmMyYjNiYTFjODQ1YzhlYmM3NmE2ZDA5OTcyZDMwYTE0NDFkMWI2NDU4MDk1MjVjIiwidGFnIjoiIn0%3D; alpl_v2_front_session=eyJpdiI6ImRSU3hQN01YNk1LSTZaclNOT3l5VlE9PSIsInZhbHVlIjoidlFWLzNYVU5UK2tSMmYwLzBMc00vajZ5R0pobksxS1Bwc0QyUVNwSUlNbFJzdi83Y0w5R0FwWXRFQW5RRjBWc1J0OW5zT1hQUTBoOVBhZk9VbGFMWlhMdSs5Znp6RDhQVVFtUmVQUEdxdnJuQUNaMkNyTms1bzRDcVIrU2NuTVgiLCJtYWMiOiJmZDE5ZDk5YzdiY2JmNzNiOGM5MjhlMWZhNGExMDkzYWNkMGRjNzA4MzkwNDRjZTVhYWM2MmUzYzhjMmYyMjE4IiwidGFnIjoiIn0%3D; device_uuid=eyJpdiI6IlNjM2NNdmxTTDE3OWRPbk45RkF5REE9PSIsInZhbHVlIjoib2dmcnNueUM0cDAycXgxejFwc05aVDBDUU9FeGpMbUxFSUFKZkkxSldjSWR5Z3QvYkJ6ZExoQ0NBQ0Q4QWFERUJYaFZYZGRuWEJGQkhSN3hNWlIrUjJ1bHlwVTJiejNuV1J0NTBuSHdmT2c9IiwibWFjIjoiYjcwODA1NDM1NjBiZjhjYzZiMzM2OTdjYjFiMDE4YTdhZmQ1ZDgwZGJiZTQyMTM1MDUyYjBjZGVkZDRmYWJkMyIsInRhZyI6IiJ9; krt_rewrite_uid=a87ff6ca-84ea-47e5-afa2-17eed43e4826; twtr_pixel_opt_in=N; aws-waf-token=41b61326-cf35-4a29-bacd-0f6264247bd7:AQoAdcQy2TXrAAAA:P9AOyR69CQryJtoy8FOh0ViT1hilKsxaCJxSJMp04AdanowlucZleAtlt45fLTGU5nEbhmkKfz2uWYc+lM0Wwp4TE++VDtYKErjv1Jg/f80nCugI8AYM5gurkRBCgp0fNWqWiIeXqfD4/Z781AO7WviOMKSkKJxOOmHHxOCHH3YjQAAVuxgCV2IgVrKlTljpHq8zjKw=',
      },
    });

    provider = new Alphapolis(client);
  });

  test('metadata', async () => {
    const data: RemoteNovelMetadata = await provider.getMetadata(novelId);
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
    const chapterId = '9003705';
    const data: RemoteChapter = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('だからお前が魔法少女に変身して魔法を使うんだよ');
  });
});
