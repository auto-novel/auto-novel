export type Glossary = Record<string, string>;

export interface SegmentContext {
  glossary?: Glossary;

  /** 当前分段之前的原文，仅供理解上下文，不属于待翻译内容。 */
  previousSource?: string;

  //过期重翻使用
  expired?: boolean;
  history?: TranslationHistory;
}

export interface Segment {
  id: string;
  order: number;
  lines: string[];
  context?: SegmentContext;
}

/** 分段级进度事件；一次输入共用一份。 */
export interface SegmentObserver {
  /** 某分段开始翻译。 */
  start(segment: Segment, translatorId: string): void;
  /** 某分段完成，译文已合并透传行。 */
  complete(segment: Segment, translatedLines: string[]): void;
  /** 某分段失败。 */
  error(segment: Segment, error: unknown): void;
}

/** 队列搬运的单位：分段 + 结算句柄 + 该输入的事件出口。 */
export interface SegmentTask {
  readonly segment: Segment;
  readonly observer: SegmentObserver;
  readonly signal?: AbortSignal;
  resolve(translatedLines: string[]): void;
  reject(error: unknown): void;
}

/**
 * 行数范围（左闭右开） [start, end)
 */
export interface LineRange {
  start: number;
  end: number;
}

export interface LineSegmenter {
  segment: (lines: string[]) => LineRange[];
}

export interface TranslationHistory {
  lines: string[];
  translatedLines: string[];
  glossary: Glossary;
}
/**
 * 组装并更新Segment信息
 * 根据history信息决定是否跳过（过期重翻逻辑）
 */
export interface SegmentAssembler {
  assemble(
    id: string,
    lines: string[],
    ranges: LineRange[],
    glossary: Glossary,
    history?: TranslationHistory,
  ): Segment[];
}

export abstract class SegmentQueue {
  abstract readonly length: number;
  abstract setHighWaterMark(value: number): void;
  abstract enqueueAll(
    tasks: SegmentTask[],
    signal?: AbortSignal,
  ): Promise<void>;
  abstract dequeue(signal?: AbortSignal): Promise<SegmentTask>;
  abstract waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void>;
  abstract ack(): void;
  /** 消费它的翻译器退休时退回队列，不计入失败。 */
  abstract requeue(tasks: readonly SegmentTask[]): void;
  abstract removeQueued(tasks: readonly SegmentTask[]): void;
  abstract clear(): void;
}

export interface PromptBuilder {
  build: (
    lines: string[],
    context?: SegmentContext,
  ) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  parseAnswer: (answer: string, originalLines: string[]) => string[];
}

export type Logger = (message: string, detail?: string[]) => void;

/** 一次翻译请求；`lines` 只包含需要翻译的内容行。 */
export interface TranslateRequest {
  lines: string[];
  context?: SegmentContext;
  signal?: AbortSignal;
  /** 从 0 开始的尝试序号；实现可据此调整请求参数。 */
  attempt: number;
}

/**
 * 翻译器只负责一次请求：拿到内容行，返回等长译文。
 * 重试、结构校验与降级时机由流水线统一决定。
 */
export interface Translator {
  /** 供流水线记录重试与降级日志；缺省静默。 */
  readonly log?: Logger;

  translate(request: TranslateRequest): Promise<string[]>;

  /** 重试耗尽且失败属于内容形状问题时的降级策略。 */
  fallback?(request: TranslateRequest): Promise<string[]>;
}

export interface TranslationLoop {
  id: string;
  translator: Translator;
  abortController: AbortController;
  //并发数不提供时默认 1 并发
  concurrency?: number;
}

export interface SegmentCache {
  get(segment: Segment): Promise<string[] | undefined>;
  set(segment: Segment, translatedLines: string[]): Promise<void>;
}

/** 分段切分结果；只带调用方需要的信息，不暴露内部切分方式。 */
export interface SegmentSummary {
  order: number;
  lines: string[];
}

export interface SegmentTracker {
  /** 文本分段成功 */
  onSegmentsReady?: (segments: SegmentSummary[]) => void;
  /** 某段开始翻译 */
  onSegStart?: (segmentOrder: number, translatorId: string) => void;
  /** 某段完成翻译 */
  onSegComplete?: (segmentOrder: number, translatedLines: string[]) => void;
  /** 某段翻译报错 */
  onSegError?: (segmentOrder: number, error: any) => void;
  /** 翻译被取消 */
  onAbort?: () => void;
}

/** 一篇完整原文；切分和队列背压由流水线负责。 */
export interface TranslationInput {
  /** 原文行；行内不应包含换行。 */
  lines: string[];
  glossary?: Glossary;
  history?: TranslationHistory;
  tracker?: SegmentTracker;
}

export interface TranslationResult {
  /** 译文行，与输入行一一对应；失败分段回退为原文。 */
  lines: string[];
  /** 失败分段及其原因；为空表示全部分段成功。 */
  failed: Array<{ order: number; error: unknown }>;
}

/** run 的输入：文本 + 该输入的结算回调。 */
export interface TranslationWork extends TranslationInput {
  /** 翻译完成；failed 非空表示有分段回退为原文。 */
  onComplete: (result: TranslationResult) => Promise<void> | void;
  /** 输入级错误；取消不会走这里。 */
  onError: (error: unknown) => Promise<void> | void;
  /** 取消时对每个在途输入调用；run 随后以 AbortError 结束。 */
  onAbort: () => Promise<void> | void;
}

export interface TranslatorTracker {
  onConcurrencyChange?: (current: number, max: number) => void;
}

/** 注册翻译器循环的可选项。 */
export interface TranslatorOptions {
  /** 并发数，缺省为 1。 */
  concurrency?: number;
  /** 并发变化回调。 */
  tracker?: TranslatorTracker;
  /** 循环 id；缺省生成随机 id。 */
  id?: string;
}
