import { v4 as uuidv4 } from 'uuid';

import { parseFile, Srt } from '@/util/file';

import { EpubParserV1 } from './EpubParser';
import { LocalVolumeDao } from './LocalVolumeDao';

export const createVolume = async (
  dao: LocalVolumeDao,
  file: File,
  favoredId: string,
) => {
  const id = file.name;
  if ((await dao.getMetadata(id)) !== undefined) {
    throw Error('小说已经存在');
  }

  const chapters: { chapterId: string; paragraphs: string[] }[] = [];

  const myFile = await parseFile(file);

  if (myFile.type === 'txt') {
    const lines = myFile.text.split('\n');
    const chunkSize = 1000;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const paragraphs = lines.slice(i, i + chunkSize);
      chapters.push({ chapterId: i.toString(), paragraphs });
    }
  } else if (myFile.type === 'epub') {
    for await (const item of myFile.iterDoc()) {
      const paragraphs = EpubParserV1.extractText(item.doc);
      chapters.push({ chapterId: item.href, paragraphs });
    }
  } else if (myFile.type === 'srt') {
    const lines = myFile.subtitles
      .flatMap((it) => it.text)
      .map((it) => Srt.cleanFormat(it));
    chapters.push({ chapterId: '0'.toString(), paragraphs: lines });
  }

  for (const { chapterId, paragraphs } of chapters) {
    await dao.createChapter({
      id: `${id}/${chapterId}`,
      volumeId: id,
      paragraphs,
    });
  }
  await dao.createMetadata({
    id,
    createAt: Date.now(),
    toc: chapters.map((it) => ({
      chapterId: it.chapterId,
    })),
    glossaryId: uuidv4(),
    glossary: {},
    favoredId,
  });
  await dao.createFile(id, file);
};
