export type Glossary = Readonly<Record<string, string>>;

export interface SegmentContext {
  readonly glossary?: Glossary;

  /** 当前分段之前的原文，仅供理解上下文，不属于待翻译内容。 */
  readonly previousSource?: string;

  //过期重翻使用
  readonly expired?: boolean;
  readonly history?: TranslationHistory;
}

export interface Segment {
  readonly id: string;
  readonly order: number;
  readonly lines: readonly string[];
  readonly context?: SegmentContext;
}

/**
 * 行数范围（左闭右开） [start, end)
 */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface LineSegmenter {
  segment: (lines: readonly string[]) => readonly LineRange[];
}

export interface TranslationHistory {
  readonly lines: readonly string[];
  readonly translatedLines: readonly string[];
  readonly glossary: Glossary;
}

export interface PromptBuilder {
  build: (
    lines: readonly string[],
    context?: SegmentContext,
  ) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  parseAnswer: (answer: string, originalLines: readonly string[]) => string[];
}

export type Logger = (message: string, detail?: readonly string[]) => void;

/** 一次翻译请求；实现只读借用输入，不应修改原文及上下文。 */
export interface TranslateRequest {
  readonly lines: readonly string[];
  readonly context?: SegmentContext;
  readonly signal?: AbortSignal;
  /** 从 0 开始的尝试序号；实现可据此调整请求参数。 */
  readonly attempt: number;
}

/**
 * 翻译器只负责一次请求：拿到内容行，返回等长译文。
 * 重试、结构校验与降级时机由流水线统一决定。
 */
export interface Translator {
  /** 是否符合公共译文库的上传要求；不代表端点安全认证。 */
  readonly trusted: boolean;
  readonly untrustedReason?: string;

  /** 供流水线记录重试与降级日志；缺省静默。 */
  readonly log?: Logger;

  /** 分段缓存键；包含模型、翻译器自身的上传可信状态与实际提示词，未知模型或未实现时不使用新版缓存。 */
  getCacheKey?(
    input: Pick<TranslateRequest, 'lines' | 'context'>,
  ): string | undefined;

  translate: (request: TranslateRequest) => Promise<readonly string[]>;

  /** 重试耗尽且失败属于内容形状问题时的降级策略。 */
  fallback?: (request: TranslateRequest) => Promise<readonly string[]>;
}

/** 键由翻译器生成，缓存只负责存储；命中译文只读借用，不会被原位修改。 */
export interface SegmentCache {
  get: (key: string) => Promise<readonly string[] | undefined>;
  set: (key: string, translatedLines: readonly string[]) => Promise<void>;
}

/** 事件参数是只读视图；需要编辑或保存为可变状态时由调用方复制。 */
export interface SegmentTracker {
  /** 文本分段成功 */
  onSegmentsReady?: (segments: readonly Segment[]) => void;
  /** 某段开始翻译 */
  onSegStart?: (segmentOrder: number, translatorId: string) => void;
  /** 某段完成翻译 */
  onSegComplete?: (
    segmentOrder: number,
    translatedLines: readonly string[],
  ) => void;
  /** 某段翻译报错 */
  onSegError?: (segmentOrder: number, error: unknown) => void;
  /** 翻译被取消 */
  onAbort?: () => void;
}

/** 一篇完整原文；切分和队列背压由流水线负责，输入按只读借用。 */
export interface TranslationInput {
  /** 只交给可信翻译器；缺省不限制，无匹配翻译器时等待，可取消。 */
  readonly trustedOnly?: boolean;
  /** 原文行；行内不应包含换行。 */
  readonly lines: readonly string[];
  readonly glossary?: Glossary;
  readonly history?: TranslationHistory;
  readonly tracker?: SegmentTracker;
}

/** 结算结果归调用方所有，不与事件或缓存共享可变数组。 */
export interface TranslationResult {
  /** 译文行，与输入行一一对应；失败分段回退为原文。 */
  lines: string[];
  /** 失败分段及其原因；为空表示全部分段成功。 */
  failed: Array<{ order: number; error: unknown }>;
}

/** 投递单元：原文行 + 该输入的结算回调。 */
export interface TranslationWork extends TranslationInput {
  /** 翻译完成；failed 非空表示有分段回退为原文。 */
  onComplete: (result: TranslationResult) => Promise<void> | void;
  /** 输入级错误；取消不会走这里。 */
  onError: (error: unknown) => Promise<void> | void;
  /** 该输入被取消时调用；随后 submit 以 AbortError 结束。 */
  onAbort: () => Promise<void> | void;
}

/** 注册翻译器循环的可选项。 */
export interface TranslatorOptions {
  /** 并发数，缺省为 1。 */
  concurrency?: number;
  /** 活跃翻译任务数变化。 */
  onActiveCountChange?: (activeCount: number) => void;
  /** 循环 id；缺省生成随机 id。 */
  id?: string;
}
