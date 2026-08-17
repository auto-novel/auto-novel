import type { RubyRequest, RubyResponse, RubySegment } from './types';

interface PendingRequest {
  reject(error: Error): void;
  resolve(segments: RubySegment[]): void;
}

const cache = new Map<string, Promise<RubySegment[]>>();
const pending = new Map<number, PendingRequest>();
let nextRequestId = 0;
let worker: Worker | undefined;

export function annotateJapanese(text: string): Promise<RubySegment[]> {
  const cached = cache.get(text);
  if (cached) return cached;

  const request = requestAnnotation(text).catch((error) => {
    cache.delete(text);
    throw error;
  });
  cache.set(text, request);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return request;
}

function requestAnnotation(text: string): Promise<RubySegment[]> {
  const rubyWorker = getWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    rubyWorker.postMessage({ id, text } satisfies RubyRequest);
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./JapaneseRuby.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = ({ data }: MessageEvent<RubyResponse>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if ('error' in data) {
      request.reject(new Error(data.error));
    } else {
      request.resolve(data.segments);
    }
  };
  worker.onerror = ({ message }) => {
    const error = new Error(message || '日语读音处理线程加载失败');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}
