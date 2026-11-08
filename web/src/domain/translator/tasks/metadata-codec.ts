import type { WebTranslateTask } from '@/model/Translator';

/** 元数据（标题、简介、目录）翻译前的编码与翻译后的还原 */
export const createWebMetadataCoder = (
  task: WebTranslateTask,
  forceMetadata: boolean,
) => {
  const encoded: string[] = [];
  // 只发送非空物理行，保留字段边界、空白行和原换行符以便重组。
  const encodeField = (text: string) => {
    const parts = text.split(/(\r\n|\r|\n)/).map((part, index) => {
      if (index % 2 === 1 || part.trim().length === 0) return part;
      const translatedIndex = encoded.length;
      encoded.push(part);
      return translatedIndex;
    });
    return (translated: readonly string[]) =>
      parts
        .map((part) => (typeof part === 'number' ? translated[part] : part))
        .join('');
  };
  const recoverTitle = !task.titleZh ? encodeField(task.titleJp) : undefined;
  const recoverIntroduction = !task.introductionZh
    ? encodeField(task.introductionJp)
    : undefined;
  const toc = task.toc
    .filter((it) => forceMetadata || !it.titleZh)
    .map((it) => it.titleJp);

  const tocWordsDict: { [key: string]: string } = {};
  const tocWords = Array.from(
    new Set(
      toc
        .map((it) => it.split(/[\s　]+/))
        .filter((it) => it.length > 0)
        .flat(),
    ),
  );

  const preTranslateTocWord = (wordJp: string) => {
    if (/^第?[０-９0-9]+話?$/.test(wordJp)) {
      return wordJp.replace('話', '话');
    } else if (wordJp === '閑話') {
      return '闲话';
    } else if (wordJp === '幕間') {
      return '幕间';
    }
  };
  const tocWordsNeedTranslate = tocWords.filter((wordJp) => {
    const wordZh = preTranslateTocWord(wordJp);
    if (wordZh !== undefined) {
      tocWordsDict[wordJp] = wordZh;
      return false;
    } else {
      return true;
    }
  });
  const tocOffset = encoded.length;
  encoded.push(...tocWordsNeedTranslate);

  const recover = (translated: readonly string[]) => {
    if (translated.length !== encoded.length) {
      throw new Error('元数据翻译结果数量不匹配');
    }
    const obj: {
      title?: string;
      introduction?: string;
      toc: { [key: string]: string };
    } = { toc: {} };

    if (recoverTitle) obj.title = recoverTitle(translated);
    if (recoverIntroduction) obj.introduction = recoverIntroduction(translated);
    tocWordsNeedTranslate.forEach((wordJp, index) => {
      tocWordsDict[wordJp] = translated[tocOffset + index];
    });

    new Set(toc).forEach((it) => {
      const spaces = it.split(/[^\s　]+/).filter((it) => it.length > 0);
      obj.toc[it] = it
        .split(/[\s　]+/)
        .map((it) => {
          if (it.length === 0) {
            return [spaces.shift() ?? ''];
          } else {
            return [tocWordsDict[it], spaces.shift() ?? ''];
          }
        })
        .flat()
        .join('');
    });
    return obj;
  };

  return {
    encoded,
    needUpload: !task.titleZh || !task.introductionZh || toc.length > 0,
    recover,
  };
};
