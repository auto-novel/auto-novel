import {
  createLineSegmenter,
  createSegmentAssembler,
  DefaultSegmentQueue,
} from '@/segment';
import {
  Glossary,
  LineSegmenter,
  Segment,
  SegmentAssembler,
  SegmentQueue,
  TranslationHistory,
  TranslationLoop,
  Translator,
  SegmentCache,
  SegmentTracker,
  TranslatorTracker,
} from '@/types';
import { Semaphore, randomUUID } from '@/utils';

export class TranslationPipeline {
  protected queue: SegmentQueue;
  protected translatorLoops: Map<string, TranslationLoop>;
  public segmenter: LineSegmenter;
  private assembler: SegmentAssembler;
  private cache?: SegmentCache;

  constructor(
    highWaterMark?: number,
    segmenter?: LineSegmenter,
    cache?: SegmentCache,
  ) {
    this.translatorLoops = new Map();
    this.queue = new DefaultSegmentQueue(highWaterMark ?? 50);
    this.segmenter = segmenter ?? createLineSegmenter(1500, 30);
    this.assembler = createSegmentAssembler();
    this.cache = cache;
  }

  async translate(
    text: string,
    glossary?: Glossary,
    history?: TranslationHistory,
    signal?: AbortSignal,
    tracker?: SegmentTracker,
  ): Promise<string> {
    signal?.throwIfAborted();

    const lines = text.split('\n');
    const ranges = this.segmenter.segment(lines);
    tracker?.onSegmentsReady?.(lines, ranges);
    glossary = glossary ?? {};

    type Deferred = {
      resolve: (value: { order: number; text: string }) => void;
      reject: (reason: any) => void;
    };
    const deferredMap = new Map<number, Deferred>();

    const onSegStart = (segment: Segment, translatorId: string) => {
      tracker?.onSegStart?.(segment.order, translatorId);
    };

    const onSegComplete = (segment: Segment, translatedLines: string[]) => {
      deferredMap.get(segment.order)?.resolve({
        order: segment.order,
        text: translatedLines.join('\n'),
      });
      if (!signal?.aborted) {
        tracker?.onSegComplete?.(segment.order, translatedLines);
      }
    };

    const onSegError = (segment: Segment, reason: any) => {
      tracker?.onSegError?.(segment.order, reason);
      deferredMap.get(segment.order)?.reject(reason);
    };

    const segments = this.assembler.assemble(
      randomUUID(),
      lines,
      ranges,
      glossary,
      onSegStart,
      onSegComplete,
      onSegError,
      history,
    );

    const segmentPromises: Promise<{ order: number; text: string }>[] = [];
    for (const seg of segments) {
      const promise = new Promise<{ order: number; text: string }>(
        (resolve, reject) => {
          const onAbort = () => reject(signal?.reason);
          signal?.addEventListener('abort', onAbort, { once: true });
          deferredMap.set(seg.order, {
            resolve: (val) => {
              signal?.removeEventListener('abort', onAbort);
              resolve(val);
            },
            reject: (err) => {
              signal?.removeEventListener('abort', onAbort);
              reject(err);
            },
          });
        },
      );
      segmentPromises.push(promise);
    }

    await this.waitUntilBelowHighWaterMark(signal);
    this.queue.enqueueAll(segments);
    const results = await Promise.allSettled(segmentPromises);

    if (signal?.aborted) {
      tracker?.onAbort?.();
      signal.throwIfAborted();
    }

    const finalSegments = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // 如果该分片翻译失败，返回原文
        return {
          order: segments[index].order,
          text: segments[index].lines.join('\n'),
        };
      }
    });
    return finalSegments
      .sort((a, b) => a.order - b.order)
      .map((r) => r.text)
      .join('\n');
  }

  registerTranslator(
    translator: Translator,
    concurrency?: number,
    tracker?: TranslatorTracker,
    translatorId?: string,
  ): string {
    const id = translatorId ?? randomUUID();
    const loop: TranslationLoop = {
      id,
      translator,
      abortController: new AbortController(),
      concurrency: concurrency ?? 1,
    };
    this.translatorLoops.set(id, loop);
    this._startLoop(loop, tracker);
    return id;
  }

  private async _startLoop(
    loop: TranslationLoop,
    tracker?: TranslatorTracker,
  ): Promise<void> {
    const semaphore = new Semaphore(loop.concurrency ?? 1);
    const updateConcurrency = () => {
      tracker?.onConcurrencyChange?.(semaphore.current, semaphore.max);
    };
    while (!loop.abortController.signal.aborted) {
      try {
        const segment = await this.queue.dequeue(loop.abortController.signal);

        // 命中缓存
        if (this.cache) {
          const cached = await this.cache.get(segment);
          if (cached) {
            segment.onComplete(segment, cached);
            continue;
          }
        }

        // 旧译文未过期
        if (segment.context?.expired === false && segment.context?.history) {
          segment.onComplete(segment, segment.context.history.translatedLines);
          continue;
        }

        semaphore
          .use(async () => {
            updateConcurrency();
            if (loop.abortController.signal.aborted) return;
            try {
              segment.onStart(segment, loop.id);
              const translatedLines = await loop.translator.translate(
                segment.lines,
                segment.context,
                loop.abortController.signal,
              );
              // 写入缓存
              if (this.cache) {
                await this.cache.set(segment, translatedLines);
              }

              segment.onComplete(segment, translatedLines);
            } catch (err: any) {
              if (err.name === 'AbortError') return;
              segment.onError(segment, err);
            }
          })
          .then(() => {
            updateConcurrency();
          });
      } catch (err) {
        if (loop.abortController.signal.aborted) break;
      }
    }
  }

  unregisterTranslator(translatorId: string): void {
    const loop = this.translatorLoops.get(translatorId);
    if (loop) {
      loop.abortController.abort();
      this.translatorLoops.delete(translatorId);
    }
  }

  clearLoops(): void {
    for (const [, loop] of this.translatorLoops) {
      loop.abortController.abort();
    }
    this.translatorLoops.clear();
  }

  waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void> {
    return this.queue.waitUntilBelowHighWaterMark(signal);
  }
}
