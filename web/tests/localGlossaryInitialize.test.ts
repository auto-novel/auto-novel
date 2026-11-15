import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createLocalVolumeDao,
  type LocalVolumeDao,
} from '../src/stores/local/LocalVolumeDao';
import type { LocalVolumeMetadata } from '../src/model/LocalVolume';

let dao: LocalVolumeDao;
let sequence = 0;
beforeAll(async () => {
  dao = await createLocalVolumeDao();
});
afterEach(() => vi.restoreAllMocks());
async function volume() {
  const metadata: LocalVolumeMetadata = {
    id: `volume-${sequence++}`,
    createAt: 1,
    favoredId: 'default',
    glossary: {},
    glossaryId: 'original',
    toc: [{ chapterId: '1' }],
  };
  await dao.createMetadata(metadata);
  await dao.createChapter({
    id: `${metadata.id}/1`,
    volumeId: metadata.id,
    paragraphs: ['原文'],
  });
  return metadata.id;
}
const glossary = { アルテ: '阿尔蒂', セレニア: '瑟蕾尼亚' };

describe('本地术语初始化事务', () => {
  it('仅初始化空表一次，并发初始化只有一个成功', async () => {
    const id = await volume();
    const results = await Promise.all([
      dao.initializeGlossary(id, glossary, 'new-version'),
      dao.initializeGlossary(id, { 別名: '其他译名' }, 'another-version'),
    ]);
    expect(results.map((result) => result.written)).toEqual([true, false]);
    expect(await dao.getMetadata(id)).toMatchObject({
      glossary,
      glossaryId: 'new-version',
    });
    expect((await dao.getChapter(id, '1'))?.gpt).toBeUndefined();
  });
  it('已有人工表、空候选和不存在的书均不改变术语版本', async () => {
    const id = await volume();
    expect((await dao.initializeGlossary(id, {}, 'unused')).written).toBe(
      false,
    );
    expect((await dao.getMetadata(id))?.glossaryId).toBe('original');
    await dao.updateMetadata(id, (metadata) => ({
      ...metadata,
      glossary: { アルテ: '人工译名' },
    }));
    expect((await dao.initializeGlossary(id, glossary, 'unused')).written).toBe(
      false,
    );
    expect(await dao.getMetadata(id)).toMatchObject({
      glossary: { アルテ: '人工译名' },
      glossaryId: 'original',
    });
    expect(
      (await dao.initializeGlossary('missing', glossary, 'unused')).metadata,
    ).toBeUndefined();
  });
  it.each(['baidu', 'youdao', 'sakura', 'gpt'] as const)(
    '已有 %s 译文时保持旧版本与原译文',
    async (translator) => {
      const id = await volume();
      const translation = {
        glossaryId: 'original',
        glossary: {},
        paragraphs: ['旧译文'],
      };
      await dao.updateChapter(id, '1', (chapter) => ({
        ...chapter,
        [translator]: translation,
      }));
      // 目录尚未写回也必须发现章节中的译文，覆盖真实保存的两个事务间隙。
      expect(
        (await dao.initializeGlossary(id, glossary, 'unused')).written,
      ).toBe(false);
      expect((await dao.getMetadata(id))?.glossaryId).toBe('original');
      expect((await dao.getChapter(id, '1'))?.[translator]).toEqual(
        translation,
      );
    },
  );
  it('章节保存先取得事务时，自动初始化不能把刚保存的译文变成过期', async () => {
    const id = await volume();
    const saving = dao.updateChapter(id, '1', (chapter) => ({
      ...chapter,
      gpt: { glossaryId: 'original', glossary: {}, paragraphs: ['刚保存'] },
    }));
    const initializing = dao.initializeGlossary(id, glossary, 'unused');
    await saving;
    expect((await initializing).written).toBe(false);
    expect((await dao.getMetadata(id))?.glossaryId).toBe('original');
  });
  it('写入前取消或存储异常会回滚，存储恢复后仍可初始化', async () => {
    const id = await volume();
    await expect(
      dao.initializeGlossary(id, glossary, 'unused', () => {
        throw new DOMException('Stopped', 'AbortError');
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect((await dao.getMetadata(id))?.glossaryId).toBe('original');
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementationOnce(() => {
        throw new DOMException('Full', 'QuotaExceededError');
      });
    await expect(
      dao.initializeGlossary(id, glossary, 'unused'),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    put.mockRestore();
    expect((await dao.getMetadata(id))?.glossaryId).toBe('original');
    expect(
      (await dao.initializeGlossary(id, glossary, 'recovered')).written,
    ).toBe(true);
    expect((await dao.getMetadata(id))?.glossaryId).toBe('recovered');
  });
});
