import { reactive } from 'vue';
import type { SegmentTracker, LineRange } from '@auto-novel/translator';

export type ChapterStatus = 'pending' | 'translating' | 'done' | 'error';
export type SegmentStatus = 'pending' | 'translating' | 'done' | 'error';

export interface ChapterMeta {
  chapterId: string;
  title: string;
  order: number;
  status: ChapterStatus;
  segmentProgress?: { completed: number; total: number };
}

export interface SegmentInfo {
  status: SegmentStatus;
  lines: string[];
  translatedLines: string[];
  error: any;
  translatorId?: string;
}

export class ChapterSegmentState implements SegmentTracker {
  readonly chapterId: string;
  ranges: LineRange[] = [];
  segments: SegmentInfo[] = [];
  ready = false;

  get allDone(): boolean {
    return (
      this.segments.length > 0 &&
      this.segments.every((s) => s.status === 'done')
    );
  }
  get completedCount(): number {
    return this.segments.filter((s) => s.status === 'done').length;
  }
  get translatingCount(): number {
    return this.segments.filter((s) => s.status === 'translating').length;
  }
  get errorCount(): number {
    return this.segments.filter((s) => s.status === 'error').length;
  }

  constructor(chapterId: string) {
    this.chapterId = chapterId;
    return reactive(this) as ChapterSegmentState;
  }

  onSegmentsReady(lines: string[], ranges: LineRange[]): void {
    this.ranges = ranges;
    this.segments = ranges.map((range) => ({
      status: 'pending',
      lines: lines.slice(range.start, range.end),
      translatedLines: [],
      error: null,
    }));
    this.ready = true;
  }

  onSegStart(segmentOrder: number, translatorId: string): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      seg.status = 'translating';
      seg.translatorId = translatorId;
    }
  }

  onSegComplete(segmentOrder: number, translatedLines: string[]): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      seg.status = 'done';
      seg.translatedLines = translatedLines;
    }
  }

  onSegError(segmentOrder: number, error: any): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      seg.status = 'error';
      seg.error = error;
    }
  }

  onAbort(): void {
    for (const seg of this.segments) {
      if (seg.status === 'translating') seg.status = 'pending';
    }
  }

  getSegmentError(segmentOrder: number): string | undefined {
    const err = this.segments[segmentOrder]?.error;
    return err ? err.message ?? String(err) : undefined;
  }

  /** 为已完成的章节注入整章译文 */
  injectDoneTranslation(
    lines: string[],
    translatedLines: string[],
    ranges?: LineRange[],
  ): void {
    this.ranges = ranges ?? [{ start: 0, end: lines.length }];
    this.segments = this.ranges.map((range) => ({
      status: 'done',
      lines: lines.slice(range.start, range.end),
      translatedLines: translatedLines.slice(range.start, range.end),
      error: null,
    }));
    this.ready = true;
  }
}

export class TaskState {
  readonly taskDesc: string;
  chapters: ChapterMeta[] = [];
  readonly chapterStates = new Map<string, ChapterSegmentState>();

  constructor(taskDesc: string) {
    this.taskDesc = taskDesc;
  }

  getChapterStatus(chapterId: string): ChapterStatus {
    return (
      this.chapters.find((c) => c.chapterId === chapterId)?.status ?? 'pending'
    );
  }

  updateChapterStatus(chapterId: string, status: ChapterStatus): void {
    const ch = this.chapters.find((c) => c.chapterId === chapterId);
    if (ch) ch.status = status;
  }

  getOrCreateChapterState(chapterId: string): ChapterSegmentState {
    let state = this.chapterStates.get(chapterId);
    if (!state) {
      state = new ChapterSegmentState(chapterId);
      this.chapterStates.set(chapterId, state);
    }
    return state;
  }
}
