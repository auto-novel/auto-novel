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
    onSegComplete: (segment: Segment, translatedLines: string[]) => void,
    onSegError: (segment: Segment, reason: any) => void,
    history?: TranslationHistory,
  ): Segment[];
}

export abstract class SegmentQueue {
  abstract readonly length: number;
  abstract readonly highWaterMark: number;
  abstract enqueueAll(segments: Segment[]): void;
  abstract dequeue(signal?: AbortSignal): Promise<Segment>;
  abstract waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void>;
}

export type PromptBuilder = (
  lines: string[],
  context?: SegmentContext,
) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;

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

export abstract class TranslationPipeline {
  protected abstract queue: SegmentQueue;
  protected translatorLoops: Map<string, TranslationLoop>;
  protected visualizer?: Visualizer;

  constructor() {
    this.translatorLoops = new Map();
  }

  abstract translate(
    text: string,
    glossary?: Glossary,
    history?: TranslationHistory,
    signal?: AbortSignal,
  ): Promise<string>;

  waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void> {
    return this.queue.waitUntilBelowHighWaterMark(signal);
  }

  abstract registerTranslator(
    translator: Translator,
    concurrency?: number,
  ): void;
  abstract unregisterTranslator(translator: Translator): void;
}

export class Visualizer {}
