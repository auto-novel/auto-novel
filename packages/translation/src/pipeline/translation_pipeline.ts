import { Semaphore } from '@/utils';
import {
  TranslationHistory,
  TranslationLoop,
  TranslationPipeline,
  SegmentQueue,
  Translator,
  LineSegmenter,
  SegmentAssembler,
  Glossary,
} from '@/types';
import { createLineSegmenter, createSegmentAssembler } from '@/segment';

export class DefaultTranslationPipeline extends TranslationPipeline {
  private segmenter: LineSegmenter;
  private assembler: SegmentAssembler;

  constructor(
    queue: SegmentQueue,
    segmenter?: LineSegmenter,
    assembler?: SegmentAssembler,
  ) {
    super(queue);
    this.segmenter = segmenter ?? createLineSegmenter(1500, 30);
    this.assembler = assembler ?? createSegmentAssembler();
  }

  async translate(
    text: string,
    glossary?: Glossary,
    history?: TranslationHistory,
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted();

    const lines = text.split('\n');
    const ranges = this.segmenter.segment(lines);
    glossary = glossary ?? {};

    type Deferred = {
      resolve: (value: { order: number; text: string }) => void;
      reject: (reason: any) => void;
    };
    const deferredMap = new Map<number, Deferred>();

    const segments = this.assembler.assemble(
      crypto.randomUUID(),
      lines,
      ranges,
      glossary,
      (segment, translatedLines) => {
        deferredMap.get(segment.order)?.resolve({
          order: segment.order,
          text: translatedLines.join('\n'),
        });
      },
      (segment, reason) => {
        deferredMap.get(segment.order)?.reject(reason);
      },
      history,
    );

    const segmentPromises: Promise<{ order: number; text: string }>[] = [];
    for (const seg of segments) {
      const promise = new Promise<{ order: number; text: string }>(
        (resolve, reject) => {
          deferredMap.set(seg.order, { resolve, reject });
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        },
      );
      segmentPromises.push(promise);
    }

    this.queue.enqueueAll(segments);
    const results = await Promise.allSettled(segmentPromises);
    const finalSegments = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // 如果该分片翻译失败或被取消，返回原文
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

  waitUntilBelowHighWaterMark(signal?: AbortSignal): Promise<void> {
    return this.queue.waitUntilBelowHighWaterMark(signal);
  }

  registerTranslator(translator: Translator, concurrency?: number): void {
    const id = crypto.randomUUID();
    const loop: TranslationLoop = {
      id,
      translator,
      abortController: new AbortController(),
      concurrency: concurrency ?? 1,
    };
    this.translatorLoops.set(id, loop);
    this._startLoop(loop);
  }

  private async _startLoop(loop: TranslationLoop): Promise<void> {
    const semaphore = new Semaphore(loop.concurrency ?? 1);
    while (!loop.abortController.signal.aborted) {
      try {
        const segment = await this.queue.dequeue(loop.abortController.signal);

        semaphore.use(async () => {
          if (loop.abortController.signal.aborted) return;
          try {
            const translatedLines = await loop.translator.translate(
              segment.lines,
              segment.context,
              loop.abortController.signal,
            );
            segment.onComplete(segment, translatedLines);
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            segment.onError(segment, err);
          }
        });
      } catch (err) {
        if (loop.abortController.signal.aborted) break;
      }
    }
  }

  unregisterTranslator(translator: Translator): void {
    for (const [id, loop] of this.translatorLoops) {
      if (loop.translator === translator) {
        loop.abortController.abort();
        this.translatorLoops.delete(id);
        break;
      }
    }
  }
}
