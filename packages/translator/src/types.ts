export type Glossary = Record<string, string>;

export interface SegmentContext {
  glossary?: Glossary;

  //初始为空，在PipeLine中动态填充的前文信息
  prevSegs?: string[][];

  //过期重翻使用
  expired?: boolean;
  history?: TranslationHistory;
}

export interface Segment {
  id: string;
  order: number;
  lines: string[];
  context?: SegmentContext;
  onStart: (segment: Segment, translatorId: string) => void;
  onComplete: (segment: Segment, translatedLines: string[]) => void;
  onError: (segment: Segment, reason: any) => void;
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
    onSegStart: (segment: Segment, translatorId: string) => void,
    onSegComplete: (segment: Segment, translatedLines: string[]) => void,
    onSegError: (segment: Segment, reason: any) => void,
    history?: TranslationHistory,
  ): Segment[];
}

export abstract class SegmentQueue {
  abstract readonly length: number;
  abstract readonly highWaterMark: number;
  abstract enqueueAll(segments: Segment[], signal?: AbortSignal): Promise<void>;
  abstract dequeue(signal?: AbortSignal): Promise<Segment>;
  abstract waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void>;
  abstract ack(): void;
}

export interface PromptBuilder {
  build: (
    lines: string[],
    context?: SegmentContext,
  ) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  parseAnswer: (answer: string, originalLines: string[]) => string[];
}

export type Logger = (message: string, detail?: string[]) => void;

export interface Translator {
  translate(
    lines: string[],
    context?: SegmentContext,
    signal?: AbortSignal,
  ): Promise<string[]>;
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

export interface SegmentTracker {
  /** 文本分段成功 */
  onSegmentsReady?: (lines: string[], ranges: LineRange[]) => void;
  /** 某段开始翻译 */
  onSegStart?: (segmentOrder: number, translatorId: string) => void;
  /** 某段完成翻译 */
  onSegComplete?: (segmentOrder: number, translatedLines: string[]) => void;
  /** 某段翻译报错 */
  onSegError?: (segmentOrder: number, error: any) => void;
  /** 翻译被取消 */
  onAbort?: () => void;
}

export interface TranslatorTracker {
  onConcurrencyChange?: (current: number, max: number) => void;
}
