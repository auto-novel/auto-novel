import ky from 'ky';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { Pixiv } from '@/web/pixiv';
import { client } from './utils';

const enabledViewingSettingsHtml = `
  <input name="sensitive_view_setting" type="checkbox" checked>
  <input name="r18" type="checkbox" checked>
  <input name="r18g" type="checkbox" checked>
`;

describe('pixiv settings and API', () => {
  test('checks enabled R18 settings before fetching a short story', async () => {
    const requestedUrls: string[] = [];
    const provider = new Pixiv(
      ky.create({
        fetch: async (input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestedUrls.push(url);
          if (url === 'https://www.pixiv.net/settings/viewing') {
            return new Response(enabledViewingSettingsHtml, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
          return new Response(
            JSON.stringify({
              error: false,
              message: '',
              body: {
                id: '8905000',
                title: '黄昏の縁で祈る',
                userName: '薫',
                userId: '1',
                characterCount: 12,
                xRestrict: 0,
                content: '第一段\n第二段',
                createDate: '2026-01-01T00:00:00+09:00',
                description: '紹介',
                caption: '',
                tags: { tags: [{ tag: 'original' }] },
                seriesNavData: null,
                textEmbeddedImages: null,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      }),
    );

    const metadata = await provider.getMetadata('s8905000');
    const chapter = await provider.getChapter('s8905000', '8905000');

    expect(metadata.title).toBe('黄昏の縁で祈る');
    expect(metadata.toc).toHaveLength(1);
    expect(chapter.paragraphs).toEqual(['第一段', '第二段']);
    expect(requestedUrls).toEqual([
      'https://www.pixiv.net/settings/viewing',
      'https://www.pixiv.net/ajax/novel/8905000',
      'https://www.pixiv.net/ajax/novel/8905000',
    ]);
  });

  test('reports Pixiv API access errors as authentication errors', async () => {
    const provider = new Pixiv(
      ky.create({
        fetch: async (input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          if (url === 'https://www.pixiv.net/settings/viewing') {
            return new Response(enabledViewingSettingsHtml, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
          return new Response(
            JSON.stringify({
              error: true,
              message: 'この作品を閲覧する権限がありません',
              body: null,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      }),
    );

    await expect(provider.getMetadata('s1')).rejects.toThrow(
      'この作品を閲覧する権限がありません',
    );
  });

  test('rejects a response that does not contain account settings', async () => {
    const requestedUrls: string[] = [];
    const provider = new Pixiv(
      ky.create({
        fetch: async (input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestedUrls.push(url);
          return new Response('<html>login</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        },
      }),
    );

    await expect(provider.getMetadata('s8905000')).rejects.toThrow(
      'Pixiv 账号未登录',
    );
    expect(requestedUrls).toEqual(['https://www.pixiv.net/settings/viewing']);
  });

  test('rejects an account unless all viewing settings are enabled', async () => {
    const provider = new Pixiv(
      ky.create({
        fetch: async () =>
          new Response(
            `
              <input name="sensitive_view_setting" type="checkbox" checked>
              <input name="r18" type="checkbox" checked>
              <input name="r18g" type="checkbox">
            `,
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            },
          ),
      }),
    );

    await expect(provider.getMetadata('s8905000')).rejects.toThrow(
      'Pixiv 账号未开启敏感内容、R18 或 R18G 查看权限',
    );
  });
});

describe('pixiv server mode', () => {
  test('fetches public metadata without a settings precheck', async () => {
    const requestedUrls: string[] = [];
    const provider = new Pixiv(
      ky.create({
        fetch: async (input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestedUrls.push(url);
          return new Response(
            JSON.stringify({
              error: false,
              message: '',
              body: {
                title: '黄昏の縁で祈る',
                userName: '薫',
                userId: '1',
                characterCount: 5629,
                xRestrict: 0,
                createDate: '2017-11-13T13:03:04+09:00',
                description: '紹介',
                caption: '',
                tags: { tags: [] },
                seriesNavData: null,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      }),
      { precheckViewingSettings: false },
    );

    const metadata = await provider.getMetadata('s8905000');

    expect(metadata.title).toBe('黄昏の縁で祈る');
    expect(requestedUrls).toEqual(['https://www.pixiv.net/ajax/novel/8905000']);
  });

  test('returns an API failure without requesting account settings', async () => {
    const requestedUrls: string[] = [];
    const provider = new Pixiv(
      ky.create({
        fetch: async (input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestedUrls.push(url);
          return new Response(
            JSON.stringify({
              error: true,
              message: 'この作品を閲覧する権限がありません',
              body: null,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      }),
      { precheckViewingSettings: false },
    );

    await expect(provider.getMetadata('s1')).rejects.toThrow(
      'この作品を閲覧する権限がありません',
    );
    expect(requestedUrls).toEqual(['https://www.pixiv.net/ajax/novel/1']);
  });
});

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
    provider = new Pixiv(client);
  });

  test('metadata', async () => {
    const data = await provider.getMetadata(novelId);
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
    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('一辈子，呵。');
  });
});

describe('pixiv-series', () => {
  const provider = new Pixiv(client);

  test('metadata', async () => {
    // 若叶睦死于傍晚的盛夏
    // https://www.pixiv.net/novel/series/10999474
    const novelId = '10999474';

    const data = await provider.getMetadata(novelId);
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
    // 若叶睦死于傍晚的盛夏
    // https://www.pixiv.net/novel/series/10999474
    const novelId = '10999474';
    const chapterId = '20701185';

    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('若叶睦，已经死于这傍晚的盛夏。');
  });
});
