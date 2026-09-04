import { describe, expect, it } from 'vitest';

import {
  classifyTocUpdate,
  type CrawlerTocItem,
} from '../src/domain/crawler/TocUpdate';

const chapter = (
  chapterId: string,
  title = chapterId,
  createAt: string | null = null,
): CrawlerTocItem => ({ title, chapterId, createAt });

const section = (title: string): CrawlerTocItem => ({
  title,
  chapterId: null,
  createAt: null,
});

describe('classifyTocUpdate', () => {
  const current = [section('第一卷'), chapter('1'), chapter('2')];

  it('allows new chapters appended to the end', () => {
    expect(classifyTocUpdate(current, [...current, chapter('3')])).toBe(
      'append-only',
    );
  });

  it('allows new chapters inserted without changing existing items', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1'),
        chapter('1.5'),
        chapter('2'),
      ]),
    ).toBe('append-only');
  });

  it('rejects an existing chapter update', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1', '修改后的标题'),
        chapter('2'),
      ]),
    ).toBe('existing-updated');
  });

  it('treats equivalent createAt representations as unchanged', () => {
    const left = [chapter('10542618', '无名', '2018-12-27T10:07:14.000Z')];
    const right = [chapter('10542618', '无名', '2018-12-27T10:07:14+00:00')];

    expect(classifyTocUpdate(left, right)).toBe('unchanged');
  });

  it('rejects a changed createAt instant', () => {
    const left = [chapter('10542618', '无名', '2018-12-27T10:07:14.000Z')];
    const right = [chapter('10542618', '无名', '2018-12-27T10:07:15+00:00')];

    expect(classifyTocUpdate(left, right)).toBe('existing-updated');
  });

  it('rejects an existing chapter update even when a chapter was added', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1', '修改后的标题'),
        chapter('2'),
        chapter('3'),
      ]),
    ).toBe('existing-updated');
  });

  it('rejects replacing an existing chapter with a new chapter', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1'),
        chapter('3'),
      ]),
    ).toBe('existing-updated');
  });

  it('rejects existing item reordering', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('2'),
        chapter('1'),
      ]),
    ).toBe('existing-updated');
  });

  it('rejects an existing section update', () => {
    expect(
      classifyTocUpdate(current, [
        section('修改后的卷名'),
        chapter('1'),
        chapter('2'),
        chapter('3'),
      ]),
    ).toBe('existing-updated');
  });

  it('reports an unchanged toc when no chapter was added', () => {
    expect(classifyTocUpdate(current, current)).toBe('unchanged');
  });
});
