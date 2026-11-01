import { SHA256 } from 'crypto-es/lib/sha256';
import type { PromptBuilder, SegmentContext } from './types';
import { splitPassthroughLines } from './pipeline/lines';

export function createTranslationCacheKey(
  model: string | undefined,
  lines: readonly string[],
  promptBuilder: PromptBuilder,
  allowUpload: boolean,
  context?: SegmentContext,
): string | undefined {
  if (!model?.trim()) return undefined;
  const { content } = splitPassthroughLines(lines);
  const messages = promptBuilder.build(content, context);
  // 保留原始行：提示词不包含空行／图片，Sakura 还会归一化全角数字。
  // 解析、格式恢复或降级策略出现不兼容变化时，递增键版本。
  return `seg:v1:${SHA256(JSON.stringify({ model, allowUpload, messages, lines })).toString()}`;
}
