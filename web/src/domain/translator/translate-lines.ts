import {
  createTranslator,
  TranslationPipeline,
  type Logger,
  type SakuraTranslatorConfig,
} from '@auto-novel/translator';

/** 工具页与单任务翻译入口使用的配置。 */
export type SingleTaskTranslatorConfig =
  | { id: 'youdao' }
  | ({ id: 'sakura'; segLength?: number } & SakuraTranslatorConfig);

export async function createSingleTaskTranslator(
  config: SingleTaskTranslatorConfig,
  log?: Logger,
) {
  // 有道沿用插件客户端；按需加载，避免其他入口提前初始化浏览器依赖。
  return config.id === 'youdao'
    ? (await import('@/external/youdao')).createYoudaoTranslator(log)
    : createTranslator({ ...config, kind: 'sakura', log });
}

/** 工具页纯文本翻译：不上传、不缓存，失败分段不能当作成功结果返回。 */
export async function translateLines(
  lines: readonly string[],
  config: SingleTaskTranslatorConfig,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted();
  if (lines.length === 0) return [];
  const translator = await createSingleTaskTranslator(config);
  signal?.throwIfAborted();
  const pipeline = new TranslationPipeline({
    segmentLength: config.id === 'sakura' ? config.segLength ?? 500 : 3500,
  });
  try {
    pipeline.registerTranslator(translator);
    const result = await pipeline.translate({ lines }, signal);
    if (result.failed.length > 0) {
      throw new Error(`${result.failed.length} 个分段翻译失败`, {
        cause: result.failed[0].error,
      });
    }
    return result.lines;
  } finally {
    pipeline.dispose();
  }
}
