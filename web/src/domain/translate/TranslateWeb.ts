import { WebNovelApi, formatError } from '@/api';
import type {
  TranslateTaskCallback,
  TranslateTaskParams,
  WebTranslateTask,
  WebTranslateTaskDesc,
} from '@/model/Translator';
import { delay } from '@/util';

import { CrawlerService } from '../crawler';
import type { Translator } from './Translator';

export const translateWeb = async (
  { providerId, novelId }: WebTranslateTaskDesc,
  {
    level,
    forceMetadata,
    useBrowserCrawler,
    startIndex,
    endIndex,
  }: TranslateTaskParams,
  callback: TranslateTaskCallback,
  translator: Translator,
  signal?: AbortSignal,
) => {
  if (useBrowserCrawler) {
    try {
      callback.log('获取小说信息');
      const novel = await WebNovelApi.getNovel(providerId, novelId);
      const sinceLastSyncMs = Date.now() - novel.syncAt * 1000;
      const SYNC_EXPIRY_MS = 60 * 60 * 1000;
      if (sinceLastSyncMs > SYNC_EXPIRY_MS) {
        callback.log('通过浏览器爬虫更新目录');
        await CrawlerService.updateWebNovel(providerId, novelId, novel);
        callback.log('目录已更新');
      } else {
        callback.log(`syncAt 未过期，跳过目录更新`);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        callback.log(`中止翻译任务`);
        return 'abort';
      } else {
        callback.log(`目录更新跳过：${await formatError(e)}`);
      }
    }
  }

  const {
    getTranslateTask,
    getChapterTranslateTask,
    updateMetadataTranslation,
    updateChapterTranslation,
  } = WebNovelApi.createTranslationApi(
    providerId,
    novelId,
    translator.id,
    level === 'sync',
    signal,
  );

  // Task
  let task: WebTranslateTask;
  try {
    callback.log('获取翻译任务');
    // 临时手段解决timeout，等数据库大修完成后删去
    try {
      task = await getTranslateTask();
    } catch (e: unknown) {
      callback.log('获取翻译任务-延迟10s重试');
      await delay(10_000, signal);
      task = await getTranslateTask();
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      callback.log(`中止翻译任务`);
      return 'abort';
    } else {
      callback.log(`发生错误，结束翻译任务：${e}`);
      return;
    }
  }

  try {
    const createMetadataCoder = () => {
      const encoded: string[] = [];
      if (!task.titleZh) {
        encoded.push(task.titleJp);
      }
      if (!task.introductionZh) {
        encoded.push(task.introductionJp);
      }
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
      encoded.push(...tocWordsNeedTranslate);

      const recover = (translated: string[]) => {
        const obj: {
          title?: string;
          introduction?: string;
          toc: { [key: string]: string };
        } = { toc: {} };

        if (!task.titleZh) {
          obj.title = translated.shift();
        }
        if (!task.introductionZh) {
          obj.introduction = translated.shift();
        }
        for (const wordJp of tocWordsNeedTranslate) {
          tocWordsDict[wordJp] = translated.shift()!;
        }

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
        needUpload: encoded.length > 0 || toc.length > 0,
        recover,
      };
    };

    const coder = createMetadataCoder();

    if (forceMetadata) {
      callback.log('重新翻译目录');
    }

    if (coder.needUpload) {
      if (translator.id === 'gpt') {
        callback.log('目前GPT翻译目录超级不稳定，跳过');
      } else {
        callback.log('翻译元数据');
        const textsDst = await translator.translate(coder.encoded, {
          glossary: task.glossary,
          signal,
        });

        callback.log(`上传元数据`);
        await updateMetadataTranslation(coder.recover(textsDst));
      }
    }
  } catch (e) {
    if (e === 'quit') {
      callback.log(`发生错误，结束翻译任务`);
      return;
    } else if (e instanceof DOMException && e.name === 'AbortError') {
      callback.log(`中止翻译任务`);
      return 'abort';
    } else {
      callback.log(`发生错误，跳过：${await formatError(e)}`);
    }
  }

  const chapters = task.toc
    .filter(({ chapterId }) => chapterId !== undefined)
    .map(({ chapterId, glossaryUuid }, index) => ({
      index,
      chapterId: chapterId!,
      glossaryUuid,
    }))
    .slice(startIndex, endIndex)
    .filter(({ glossaryUuid }) => {
      if (level === 'normal') {
        return glossaryUuid === undefined;
      } else if (level === 'expire') {
        return glossaryUuid === undefined || glossaryUuid !== task.glossaryUuid;
      } else {
        return true;
      }
    });

  callback.onStart(chapters.length);
  if (chapters.length === 0) {
    callback.log(`没有需要更新的章节`);
  }

  const forceSeg = level === 'all';
  for (const { index, chapterId } of chapters) {
    try {
      callback.log(`\n[${index}] ${providerId}/${novelId}/${chapterId}`);
      if (useBrowserCrawler) {
        callback.log(`通过浏览器爬虫更新章节`);
        const action = await CrawlerService.updateWebNovelChapter(
          providerId,
          novelId,
          chapterId,
        );
        callback.log(action === 'created' ? '章节已创建' : '章节已更新');
      }
      const cTask = await getChapterTranslateTask(chapterId);

      if (!forceSeg && cTask.glossaryId === cTask.oldGlossaryId) {
        callback.log(`无需翻译`);

        callback.onChapterSuccess({});
      } else {
        const textsZh = await translator.translate(cTask.paragraphJp, {
          glossary: cTask.glossary,
          oldTextZh: cTask.oldParagraphZh,
          oldGlossary: cTask.oldGlossary,
          force: forceSeg,
          signal,
        });
        callback.log(`上传章节`);
        const { jp, zh } = await updateChapterTranslation(chapterId, {
          glossaryId: cTask.glossaryId,
          paragraphsZh: textsZh,
        });
        callback.onChapterSuccess({ jp, zh });
      }
    } catch (e) {
      if (e === 'quit') {
        callback.log(`发生错误，结束翻译任务`);
        return;
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        callback.log(`中止翻译任务`);
        return 'abort';
      } else {
        callback.log(`发生错误，跳过：${await formatError(e)}`);
        callback.onChapterFailure();
      }
    }
  }
};
