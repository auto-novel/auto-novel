import { describe, expect, it } from 'vite-plus/test';

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

  it('allows deleting a chapter while adding a new chapter', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1'),
        chapter('3'),
      ]),
    ).toBe('chapters-deleted');
  });

  it.each([1, 2, 3])(
    'allows deleting %i chapters without additions',
    (count) => {
      const chapters = ['1', '2', '3', '4'].map((id) => chapter(id));
      expect(
        classifyTocUpdate(
          [section('第一卷'), ...chapters],
          [section('第一卷'), ...chapters.slice(count)],
        ),
      ).toBe('chapters-deleted');
    },
  );

  it('rejects deleting more than three chapters even with additions', () => {
    expect(
      classifyTocUpdate(
        [section('第一卷'), ...['1', '2', '3', '4'].map((id) => chapter(id))],
        [section('第一卷'), chapter('5')],
      ),
    ).toBe('existing-updated');
  });

  it('rejects updating a remaining chapter after a deletion', () => {
    expect(
      classifyTocUpdate(current, [
        section('第一卷'),
        chapter('1', '修改后的标题'),
      ]),
    ).toBe('existing-updated');
  });

  it('rejects reordering remaining chapters after a deletion', () => {
    expect(
      classifyTocUpdate(
        [...current, chapter('3')],
        [section('第一卷'), chapter('2'), chapter('1')],
      ),
    ).toBe('existing-updated');
  });

  it('rejects deleting an existing section along with its chapter', () => {
    expect(
      classifyTocUpdate([...current, section('第二卷'), chapter('3')], current),
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
