import type { GenericNovelId } from '@/model/Common';
import type { TranslatorId } from '@/model/Translator';
import { useReaderSettingStore, useSettingStore } from '@/stores';
import type { ReaderChapter } from '../ReaderStore';

export type ReaderParagraph =
  | {
      indent: string;
      text: string;
      source?: string;
      secondary: boolean;
      needSpeak: boolean;
    }
  | { imageUrl: string }
  | undefined;

export const buildParagraphs = (
  gnid: GenericNovelId,
  chapter: ReaderChapter,
): ReaderParagraph[] => {
  const cc = useSettingStore().cc;
  const setting = useReaderSettingStore().readerSetting;

  const merged: ReaderParagraph[] = [];
  const styles: {
    paragraphs: string[];
    source?: string;
    secondary: boolean;
    needSpeak: boolean;
  }[] = [];
  const needSpeakJp =
    setting.mode === 'jp' || setting.speakLanguages.includes('jp');
  const needSpeakZh =
    setting.mode === 'zh' || setting.speakLanguages.includes('zh');

  if (setting.mode === 'jp') {
    styles.push({
      paragraphs: chapter.paragraphs,
      source: 'J',
      secondary: false,
      needSpeak: needSpeakJp,
    });
  } else {
    if (setting.mode === 'jp-zh') {
      styles.push({
        paragraphs: chapter.paragraphs,
        source: 'J',
        secondary: true,
        needSpeak: needSpeakJp,
      });
    }

    const paragraphsWithLabel = (
      t: TranslatorId,
    ): [string, string[] | undefined] => {
      if (t === 'youdao') {
        return ['有道', chapter.youdaoParagraphs];
      } else if (t === 'baidu') {
        return ['百度', chapter.baiduParagraphs];
      } else if (t === 'gpt') {
        return ['GPT', chapter.gptParagraphs];
      } else {
        return ['Sakura', chapter.sakuraParagraphs];
      }
    };
    if (setting.translationsMode === 'priority') {
      let hasAnyTranslation = false;
      for (const t of setting.translations) {
        const [label, paragraphs] = paragraphsWithLabel(t);
        if (paragraphs) {
          hasAnyTranslation = true;
          styles.push({
            paragraphs: paragraphs.map((it) => cc.toView(it)),
            source: t[0].toUpperCase(),
            secondary: false,
            needSpeak: needSpeakZh,
          });
          break;
        } else {
          merged.push({
            indent: '',
            text: label + '翻译不存在',
            secondary: true,
            needSpeak: true,
          });
        }
      }
      if (!hasAnyTranslation) {
        return merged;
      }
    } else {
      let i = 0;
      for (const t of setting.translations) {
        const [label, paragraphs] = paragraphsWithLabel(t);
        if (paragraphs) {
          styles.push({
            paragraphs: paragraphs.map((it) => cc.toView(it)),
            source: t[0].toUpperCase(),
            secondary: false,
            needSpeak: needSpeakZh && i === 0,
          });
        } else {
          merged.push({
            indent: '',
            text: label + '翻译不存在',
            secondary: true,
            needSpeak: true,
          });
        }
        i++;
      }
    }

    if (setting.mode === 'zh-jp') {
      styles.push({
        paragraphs: chapter.paragraphs,
        source: 'J',
        secondary: true,
        needSpeak: needSpeakJp,
      });
    }
  }

  for (let i = 0; i < chapter.paragraphs.length; i++) {
    const curParagraph = chapter.paragraphs[i];
    if (curParagraph.trim().length === 0) {
      merged.push(undefined);
    } else if (curParagraph.startsWith('<图片>')) {
      merged.push({ imageUrl: curParagraph.slice(4) });
    } else {
      let indentLongest: string = '';
      for (const style of styles) {
        const paragraphText = style.paragraphs[i];
        const firstCharIndex = paragraphText.search(/\S|$/);
        const indent = paragraphText.slice(0, firstCharIndex);
        if (indentLongest.length < indent.length) {
          indentLongest = indent;
        }
      }

      if (indentLongest && indentLongest.length <= 2) {
        // 至少两个全角空格缩进
        indentLongest = '　　';
      }

      for (const style of styles) {
        const paragraphText = style.paragraphs[i];
        const text = paragraphText.trimStart();
        merged.push({
          indent: indentLongest,
          text,
          source: style.source,
          secondary: style.secondary,
          needSpeak: style.needSpeak,
        });
      }
    }
  }
  return merged;
};
