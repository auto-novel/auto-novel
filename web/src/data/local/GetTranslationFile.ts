import { parseFile } from '@/util/file';

import { EpubParserV1 } from './EpubParser';
import { LocalVolumeDao } from './LocalVolumeDao';

export const getTranslationFile = async (
  dao: LocalVolumeDao,
  {
    id,
    mode,
    translationsMode,
    translations,
  }: {
    id: string;
    mode: 'zh' | 'zh-jp' | 'jp-zh';
    translationsMode: 'parallel' | 'priority';
    translations: ('sakura' | 'baidu' | 'youdao' | 'gpt')[];
  },
) => {
  const filename = [
    mode,
    (translationsMode === 'parallel' ? 'B' : 'Y') +
      translations.map((it) => it[0]).join(''),
    id,
  ].join('.');

  const metadata = await dao.getMetadata(id);
  if (metadata === undefined) throw Error('小说不存在');

  const getZhLinesList = async (chapterId: string) => {
    const chapter = await dao.getChapter(id, chapterId);
    if (chapter === undefined) throw Error('章节不存在');

    const jpLines = chapter.paragraphs;
    const zhLinesList: Array<Array<string>> = [];

    for (const id of translations) {
      const zhLine = chapter[id]?.paragraphs;
      if (zhLine !== undefined) zhLinesList.push(zhLine);
    }

    if (translationsMode === 'priority' && zhLinesList.length > 1) {
      zhLinesList.length = 1;
    }

    return { jpLines, zhLinesList };
  };

  const file = await dao.getFile(id);
  if (file === undefined) throw Error('原始文件不存在');

  const myFile = await parseFile(file.file);

  if (myFile.type === 'txt') {
    const buffer = [];
    for (const { chapterId } of metadata.toc) {
      const { jpLines, zhLinesList } = await getZhLinesList(chapterId);

      if (zhLinesList.length === 0) {
        buffer.push('// 该分段翻译缺失。');
      } else {
        const combinedLinesList = zhLinesList;
        if (mode === 'jp-zh') {
          combinedLinesList.unshift(jpLines);
        } else if (mode === 'zh-jp') {
          combinedLinesList.push(jpLines);
        }
        for (let i = 0; i < combinedLinesList[0].length; i++) {
          combinedLinesList.forEach((lines) => buffer.push(lines[i]));
        }
      }
    }
    myFile.text = buffer.join('\n');
  } else if (myFile.type === 'epub') {
    // 防止部分阅读器使用竖排
    myFile.packageDoc
      .getElementsByTagName('spine')
      .item(0)
      ?.removeAttribute('page-progression-direction');

    for await (const item of myFile.iterDoc()) {
      if (metadata.toc.some((it) => it.chapterId === item.href)) {
        const { zhLinesList } = await getZhLinesList(item.href);
        if (zhLinesList.length > 0) {
          await EpubParserV1.injectTranslation(item.doc, mode, zhLinesList);
        }
      }
    }

    // 清除css格式
    myFile.cleanStyle();
  } else if (myFile.type === 'srt') {
    const { zhLinesList } = await getZhLinesList('0');
    const newSubtitles: typeof myFile.subtitles = [];
    for (const s of myFile.subtitles) {
      const texts: string[][] = [];
      for (const zhLines of zhLinesList) {
        texts.push(zhLines.slice(0, s.text.length));
        zhLines.splice(0, s.text.length);
      }
      if (mode === 'jp-zh') {
        texts.unshift(s.text);
      } else if (mode === 'zh-jp') {
        texts.push(s.text);
      }

      for (const text of texts) {
        newSubtitles.push({
          id: (newSubtitles.length + 1).toString(),
          time: s.time,
          text,
        });
      }
    }
    myFile.subtitles = newSubtitles;
  }

  return {
    filename,
    blob: await myFile.toBlob(),
  };
};
