import { MD5 } from 'crypto-es/lib/md5';
import type { Segment, SegmentCache } from '@auto-novel/translator';
import { TranslationCacheRepo } from '@/repos';

export class IndexedDbSegmentCache implements SegmentCache {
  constructor(private storeName: 'gpt-seg-cache' = 'gpt-seg-cache') {}

  async get(segment: Segment): Promise<string[] | undefined> {
    const key = this.computeKey(segment);
    return TranslationCacheRepo.get(this.storeName, key);
  }

  async set(segment: Segment, translatedLines: string[]): Promise<void> {
    const key = this.computeKey(segment);
    await TranslationCacheRepo.create(this.storeName, key, translatedLines);
  }

  clear(): Promise<void> {
    return TranslationCacheRepo.clear(this.storeName);
  }

  private computeKey(segment: Segment): string {
    return MD5(
      JSON.stringify({
        lines: segment.lines,
        glossary: segment.context?.glossary,
      }),
    ).toString();
  }
}
