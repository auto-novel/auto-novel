import { describe, expect, it, vi } from 'vite-plus/test';

import { GenericNovelId } from '../src/model/Common';
import { buildParagraphs } from '../src/pages/reader/components/BuildParagraphs';

const defaultSetting = {
  mode: 'zh-jp',
  translationsMode: 'priority',
  translations: ['gpt'],
  speakLanguages: ['jp'],
};

const { getReaderSetting } = vi.hoisted(() => ({ getReaderSetting: vi.fn() }));
vi.mock('@/stores', () => ({
  useSettingStore: () => ({ cc: { toView: (text: string) => text } }),
  useReaderSettingStore: () => ({ readerSetting: getReaderSetting() }),
}));

const gnid = GenericNovelId.local('test');
const chapter = { chapterId: '1', titleJp: '第一章', paragraphs: ['　原文'] };

describe('reader missing translations', () => {
  it.each(['jp-zh', 'zh-jp', 'zh'] as const)(
    'keeps the expected source text in %s mode',
    (mode) => {
      getReaderSetting.mockReturnValue({
        ...defaultSetting,
        mode,
        translationsMode: 'priority',
        translations: ['gpt'],
      });
      const paragraphs = buildParagraphs(gnid, chapter);
      expect(paragraphs).toContainEqual(
        expect.objectContaining({ missing: true, text: 'GPT翻译不存在' }),
      );
      const source = paragraphs.filter(
        (p) => p && 'source' in p && p.source === 'J',
      );
      if (mode === 'zh') {
        expect(source).toEqual([]);
      } else {
        expect(source).toEqual([
          expect.objectContaining({
            text: '原文',
            indent: '　',
            secondary: true,
          }),
        ]);
      }
    },
  );

  it('keeps source text when no translators are selected in bilingual mode', () => {
    getReaderSetting.mockReturnValue({
      ...defaultSetting,
      mode: 'zh-jp',
      translations: [],
    });
    expect(buildParagraphs(gnid, chapter)).toContainEqual(
      expect.objectContaining({ text: '原文', source: 'J' }),
    );
  });
});
