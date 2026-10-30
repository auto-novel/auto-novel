import type { SegmentContext, Translator } from '@auto-novel/translator';
import { createGlossaryWrapper } from '@/domain/translate/Common';

/** 为有道补齐术语保护、特殊行透传和输出行数校验。 */
export class YoudaoTranslator implements Translator {
  constructor(private translator: Translator) {}

  static async create(log?: (message: string, detail?: string[]) => void) {
    const { createYoudaoTranslator } = await import(
      '@/external/translator/YoudaoTranslator'
    );
    return new YoudaoTranslator(await createYoudaoTranslator(log));
  }

  async translate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]> {
    signal?.throwIfAborted();
    const indexes = lines.flatMap((line, index) =>
      line.trim().length === 0 || line.startsWith('<图片>') ? [] : [index],
    );
    if (indexes.length === 0) return [...lines];

    // 旧包装会移除术语备注，使用副本避免污染任务及缓存使用的术语表。
    const glossary = { ...context?.glossary };
    let translated: string[];
    try {
      translated = await createGlossaryWrapper(glossary)(
        indexes.map((index) => lines[index]),
        (encoded) => this.translator.translate(encoded, context, signal),
      );
    } catch (error) {
      if (error === 'quit')
        throw new Error('有道翻译不可用，请检查插件、Cookie 或稍后重试');
      throw error;
    }
    signal?.throwIfAborted();
    if (
      translated.length !== indexes.length ||
      translated.some((line) => /[\r\n]/.test(line))
    ) {
      throw new Error('有道翻译结果行数不匹配');
    }
    const result = [...lines];
    indexes.forEach((index, i) => {
      const heading = lines[index].match(/^\s*/)?.[0] ?? '';
      result[index] = heading + translated[i].trimStart();
    });
    return result;
  }
}
