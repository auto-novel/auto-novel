import type { Glossary } from './Glossary';

export interface ChapterTranslation {
  glossaryId: string;
  glossary: Glossary;
  paragraphs: string[];
}

export interface LocalVolumeMetadata {
  id: string;
  readAt?: number;
  createAt: number;
  toc: {
    chapterId: string;
    baidu?: string;
    youdao?: string;
    gpt?: string;
    sakura?: string;
    murasaki?: string;
  }[];
  glossaryId: string;
  glossary: Glossary;
  favoredId: string;
}

export interface LocalVolumeChapter {
  id: string;
  volumeId: string;
  paragraphs: string[];
  baidu?: ChapterTranslation;
  youdao?: ChapterTranslation;
  gpt?: ChapterTranslation;
  sakura?: ChapterTranslation;
  murasaki?: ChapterTranslation;
}
