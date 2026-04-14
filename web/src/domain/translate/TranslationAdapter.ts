import type {
  TranslationTask,
  Translator as PackagesTranslator,
  TranslationResult,
} from '@auto-novel/translation';
import type { Glossary } from '@/model/Glossary';
import type { TranslatorId } from '@/model/Translator';
import type { SegmentContext, SegmentTranslator, Segmentor } from './Common';
import { createLengthSegmentor } from './Common';

export class TranslationAdapter implements SegmentTranslator {
  private translator: PackagesTranslator;
  public readonly id: TranslatorId;
  public readonly segmentor: Segmentor;
  public log: (message: string, detail?: string[]) => void;

  constructor(
    packagesTranslator: PackagesTranslator,
    translatorId: TranslatorId,
    log: (message: string, detail?: string[]) => void,
  ) {
    this.translator = packagesTranslator;
    this.id = translatorId;
    this.log = log;
    this.segmentor = createLengthSegmentor(1500, 30);
  }

  async translate(seg: string[], context: SegmentContext): Promise<string[]> {
    let retry = 0;
    let failBecauseLineNumberNotMatch = 0;

    while (retry < 3) {
      try {
        const translatedLines = await this.translateSegment(
          seg,
          context.glossary,
          context.signal,
        );

        // 检查行数匹配
        if (seg.length !== translatedLines.length) {
          failBecauseLineNumberNotMatch++;
          this.log(
            `行数不匹配: 预期 ${seg.length} 行, 实际得到 ${translatedLines.length} 行`,
          );

          if (failBecauseLineNumberNotMatch === 3 && seg.length > 1) {
            this.log('连续三次行数不匹配，启动二分翻译');
            return await this.translateWithBinary(
              seg,
              context.glossary,
              context.signal,
            );
          }
          retry++;
          continue;
        }
        // 恢复行首空格
        for (let i = 0; i < seg.length; i++) {
          const lineJp = seg[i];
          if (lineJp.trim().length === 0) continue;
          const space = lineJp.match(/^\s*/)?.[0] || '';
          translatedLines[i] = space + translatedLines[i].trimStart();
        }
        return translatedLines;
      } catch (error: any) {
        this.log(`翻译失败: ${error.message}`);
        retry++;

        if (retry >= 3) {
          throw error;
        }
      }
    }

    throw new Error('重试次数太多');
  }

  private async translateWithBinary(
    seg: string[],
    glossary: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string[]> {
    // 如果分段很小，直接翻译
    if (seg.length <= 1) {
      return this.translateSegment(seg, glossary, signal);
    }

    // 二分翻译逻辑
    const mid = Math.floor(seg.length / 2);
    const left = await this.translateSegment(
      seg.slice(0, mid),
      glossary,
      signal,
    );
    const right = await this.translateSegment(seg.slice(mid), glossary, signal);

    return [...left, ...right];
  }

  private async translateSegment(
    seg: string[],
    glossary: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string[]> {
    // 调用packages/translation的翻译逻辑
    const task: TranslationTask = {
      id: crypto.randomUUID(),
      text: seg.join('\n'),
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: this.translator.type,
      glossary: this.convertGlossary(glossary),
    };

    const result = await this.translator.translate(task);

    if (result.status === 'success') {
      return result.translatedText.split('\n');
    } else {
      throw new Error(result.error);
    }
  }

  private convertGlossary(
    glossary: Glossary,
  ): Record<string, string> | undefined {
    if (!glossary || Object.keys(glossary).length === 0) {
      return undefined;
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(glossary)) {
      result[key] = value;
    }
    return result;
  }
}
