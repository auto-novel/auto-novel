export type Glossary = Record<string, string>;

export interface SegmentContext {
  glossary: Glossary;

  //初始为空，翻译过程中动态填充
  prevSegs: Segment[];

  //过期重翻使用
  expired?: boolean;
  history?: TranslationHistory;
}

export interface Segment {
  id: string;
  order: number;
  lines: string[];
  context: SegmentContext;
  onComplete: (translatedLines: string[]) => void;
  onError: (reason: any) => void;
}

//行数范围(左闭右开) [start, end)
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

//组装并更新Segment信息
//根据history信息决定是否跳过（过期重翻逻辑）
export interface SegmentAssembler {
  assemble(
    id: string,
    lines: string[],
    ranges: LineRange[],
    glossary: Glossary,
    onSegComplete: (translatedLines: string[]) => void,
    onSegError: (reason: any) => void,
    history?: TranslationHistory,
  ): Segment[];
}

export abstract class SegmentQueue {
  abstract readonly length: number;
  abstract readonly highWaterMark: number;
  abstract enqueueAll(segments: Segment[]): void;
  abstract dequeue(): Promise<Segment>;
  abstract waitUntilBelowHighWaterMark(): Promise<void>;
}

export interface Translator {
  translate(text: string, context: SegmentContext): Promise<string>;
}

export interface TranslationLoop {
  id: string;
  translator: Translator;
  abortController: AbortController;
}

export interface PipelineConfig {
  highWaterMark: number;
}

export class Visualizer {}

export abstract class TranslationPipeline {
  protected config: PipelineConfig;
  protected queue: SegmentQueue;
  protected translatorLoops: Map<string, TranslationLoop>;
  protected visualizer?: Visualizer;

  constructor(config: PipelineConfig, queue: SegmentQueue) {
    this.config = config;
    this.queue = queue;
    this.translatorLoops = new Map();
  }

  abstract translate(
    text: string,
    history?: TranslationHistory,
  ): Promise<string>;
  abstract waitUntilBelowHighWaterMark(): Promise<void>;
  abstract registerTranslator(translator: Translator): void;
  abstract unregisterTranslator(translator: Translator): void;
}
