export interface Segment {
  id: string;
  order: string;
  text: string;
  onComplete: (translatedText: string) => void;
  onError: (reason: any) => void;
}

export interface Translator {
  translate(text: string): Promise<string>;
}

export interface TranslationLoop {
  id: string;
  translator: Translator;
  abortController: AbortController;
}

export interface PipelineConfig {
  highWaterMark: number;
}

export abstract class SegmentQueue {
  abstract readonly length: number;
  abstract readonly highWaterMark: number;
  abstract enqueueAll(segments: Segment[]): void;
  abstract dequeue(): Promise<Segment>;
  abstract waitUntilBelowHighWaterMark(): Promise<void>;
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

  abstract translate(text: string): Promise<string>;
  abstract waitUntilBelowHighWaterMark(): Promise<void>;
  abstract registerTranslator(translator: Translator): void;
  abstract unregisterTranslator(translator: Translator): void;
}
