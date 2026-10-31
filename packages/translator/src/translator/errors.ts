/**
 * 单次翻译尝试的软失败：流水线据此重试，`kind` 决定是否触发降级。
 * - `request`：网络/超时等可重试的传输错误；
 * - `lines`：输出行数或行内结构不符合要求；
 * - `language`：输出语言不是目标语言；
 * - `degraded`：输出退化（如触达 token 上限）。
 */
export class TranslationRejected extends Error {
  readonly kind: TranslationRejectionKind;
  readonly cause?: unknown;

  constructor(
    kind: TranslationRejectionKind,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'TranslationRejected';
    this.kind = kind;
    this.cause = cause;
  }
}

export type TranslationRejectionKind =
  | 'request'
  | 'lines'
  | 'language'
  | 'degraded';

/** 只有内容形状问题才值得换一种拆分方式重试。 */
export const isContentRejection = (error: unknown): boolean =>
  error instanceof TranslationRejected &&
  (error.kind === 'lines' || error.kind === 'degraded');

/** 翻译器整体不可用：鉴权、风控、服务不可达等，通常需要用户处理。 */
export class TranslationUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationUnavailable';
  }
}
