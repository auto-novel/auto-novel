import ky from 'ky';
import { describe, expect, test } from 'vitest';

import { CrawlerParseError } from '@/errors';
import { Hameln } from '@/web/hameln';
import { WebNovelAttention } from '@/web/types';
import { client } from './utils';

const createMetadataClient = (title: string) =>
  ky.create({
    fetch: async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const html = url.includes('mode=ss_detail')
        ? `
          <table>
            <tr><td>タイトル</td><td>${title}</td></tr>
            <tr><td>総合評価</td><td>1,000pt</td></tr>
            <tr><td>合計文字数</td><td>2,000字</td></tr>
            <tr><td>掲載開始</td><td>2026年08月11日 12:00</td></tr>
            <tr><td>話数</td><td>短編</td></tr>
          </table>
        `
        : '<div id="maind"><div class="ss"></div><div class="ss"></div></div>';
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  });

const createReaderMetadataClient = () =>
  ky.create({
    fetch: async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const html = url.includes('mode=ss_detail')
        ? `
          <table>
            <tr><td>総合評価</td><td>1,000pt</td></tr>
            <tr><td>合計文字数</td><td>2,000字</td></tr>
            <tr><td>掲載開始</td><td>2026年08月11日 12:00</td></tr>
            <tr><td>話数</td><td>短編</td></tr>
          </table>
        `
        : `
          <div id="maind">
            <div class="ss">
              <p>
                <span style="font-size:120%"><a href="./">作品标题</a></span>
                　作：<a href="https://syosetu.org/user/1/">作者名</a>
              </p>
              <a href="https://h.syosetu.org/search/?mode=search&word=原作：オリジナル">オリジナル</a>：
              <a href="https://h.syosetu.org/search/?mode=search&word=ジャンル：ホラー">ホラー</a>
              <br>
              タグ：
              <a href="https://h.syosetu.org/search/?mode=search&word=R-18" class="alert_color">R-18</a>
              <a href="https://h.syosetu.org/search/?mode=search&word=残酷な描写" class="alert_color">残酷な描写</a>
              <span itemprop="keywords"><a href="https://h.syosetu.org/search/?mode=search&word=百合">百合</a></span>
            </div>
            <div class="ss">
              简介第一行<br>简介第二行<br><hr>
              <div style="text-align:right;font-size:80%">1 / 1</div>
              <div id="maegaki">前书</div>
              <span style="font-size:120%">章节标题</span>
              <div id="honbun"><p id="0">正文第一段</p></div>
            </div>
          </div>
        `;
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  });

describe('hameln', () => {
  const provider = new Hameln(client);

  test('falls back to the detail title when the list title is absent', async () => {
    const data = await new Hameln(
      createMetadataClient('詳細ページのタイトル'),
    ).getMetadata('short-story');

    expect(data.title).toBe('詳細ページのタイトル');
  });

  test('rejects metadata when neither page contains a title', async () => {
    const task = new Hameln(createMetadataClient('')).getMetadata(
      'missing-title',
    );

    await expect(task).rejects.toThrow(CrawlerParseError);
    await expect(task).rejects.toThrow('标题解析失败');
  });

  test('parses short story reader page metadata', async () => {
    const data = await new Hameln(createReaderMetadataClient()).getMetadata(
      'short-story',
    );

    expect(data.title).toBe('作品标题');
    expect(data.authors[0]).toEqual({
      name: '作者名',
      link: 'https://syosetu.org/user/1/',
    });
    expect(data.attentions).toContain(WebNovelAttention.R18);
    expect(data.attentions).toContain(WebNovelAttention.Cruelty);
    expect(data.keywords).toEqual(['オリジナル', 'ホラー', '百合']);
    expect(data.introduction).toBe('简介第一行\n简介第二行');
    expect(data.toc).toEqual([
      {
        title: '章节标题',
        chapterId: 'default',
        createAt: '2026-08-11T03:00:00.000Z',
      },
    ]);
  });

  test('metadata', async () => {
    // ts転生者の生徒が、頑張るだけのお話。
    // https://syosetu.org/novel/320297/
    const novelId = '320297';

    const data = await provider.getMetadata(novelId);
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
    // ts転生者の生徒が、頑張るだけのお話。
    // https://syosetu.org/novel/320297/
    const novelId = '320297';
    const chapterId = '174';

    const data = await provider.getChapter(novelId, chapterId);
    expect(data).toBeDefined();
    const text = data.paragraphs.join('\n');
    expect(text).contain('お疲れ様、先生');
  });
});
