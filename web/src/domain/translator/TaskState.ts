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
  /** 是否完成 Segment 切分 */
  ready = false;
  /** 原文/译文是否已释放（章节 done 后释放，预览时再按需装回） */
  textReleased = false;
  /** 每个翻译器当前失败的分段数（增量维护，避免状态每次变化都全量扫描 segments） */
  errorByTranslator: Record<string, number> = {};

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

  /** 释放整章原文/译文，只留状态元数据；预览会按需装回（injectDoneTranslation） */
  releaseText(): void {
    for (const seg of this.segments) {
      if (seg.lines.length > 0) seg.lines = [];
      if (seg.translatedLines.length > 0) seg.translatedLines = [];
    }
    this.textReleased = true;
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
    this.errorByTranslator = {};
    this.textReleased = false;
    this.ready = true;
  }

  onSegStart(segmentOrder: number, translatorId: string): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      if (seg.status === 'error') bumpError(this, seg.translatorId, -1);
      seg.status = 'translating';
      seg.translatorId = translatorId;
    }
  }

  onSegComplete(segmentOrder: number, translatedLines: string[]): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      if (seg.status === 'error') bumpError(this, seg.translatorId, -1);
      seg.status = 'done';
      seg.translatedLines = translatedLines;
    }
  }

  onSegError(segmentOrder: number, error: any): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      if (seg.status !== 'error') bumpError(this, seg.translatorId, 1);
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
    this.errorByTranslator = {};
    this.textReleased = false;
    this.ready = true;
  }
}

/** 维护 errorByTranslator 的计数（写成模块级函数，避免 reactive 包装后私有方法丢失） */
function bumpError(
  state: ChapterSegmentState,
  translatorId: string | undefined,
  delta: number,
): void {
  if (!translatorId) return;
  const next = (state.errorByTranslator[translatorId] ?? 0) + delta;
  if (next > 0) state.errorByTranslator[translatorId] = next;
  else delete state.errorByTranslator[translatorId];
}

export class TaskState {
  readonly taskDesc: string;
  chapters: ChapterMeta[] = [];
  readonly chapterStates = new Map<string, ChapterSegmentState>();
  /** initChapters 执行完毕后设为 true */
  initialized = false;

  constructor(taskDesc: string) {
    this.taskDesc = taskDesc;
  }

  initChapters(chapters: ChapterMeta[]): void {
    this.chapters = chapters;
    this.initialized = true;
  }

  getStatus(chapterId: string): ChapterStatus | undefined {
    return this.chapters.find((c) => c.chapterId === chapterId)?.status;
  }

  updateStatus(chapterId: string, status: ChapterStatus): void {
    const ch = this.chapters.find((c) => c.chapterId === chapterId);
    if (ch) ch.status = status;
  }

  getChapterState(chapterId: string): ChapterSegmentState | undefined {
    if (!this.chapters.some((c) => c.chapterId === chapterId)) return undefined;
    let state = this.chapterStates.get(chapterId);
    if (!state) {
      state = new ChapterSegmentState(chapterId);
      this.chapterStates.set(chapterId, state);
    }
    return state;
  }
}
