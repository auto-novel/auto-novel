import type { Segment, SegmentTracker } from '@auto-novel/translator';

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
  error: unknown;
  translatorId?: string;
}

/** 翻译器可能抛出任意值，展示时优先取可读消息。 */
const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
};

export class ChapterSegmentState implements SegmentTracker {
  readonly chapterId: string;
  /** 获取原文、保存译文等章节级错误，与分段翻译错误独立。 */
  errorMessage: string | undefined = undefined;
  segments: SegmentInfo[] = [];
  /** 是否完成 Segment 切分 */
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

  onSegmentsReady(segments: readonly Segment[]): void {
    this.segments = segments.map((segment) => ({
      status: 'pending',
      lines: [...segment.lines],
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

  onSegComplete(
    segmentOrder: number,
    translatedLines: readonly string[],
  ): void {
    const seg = this.segments[segmentOrder];
    if (seg) {
      seg.status = 'done';
      seg.translatedLines = [...translatedLines];
    }
  }

  onSegError(segmentOrder: number, error: unknown): void {
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
    return err ? errorMessage(err) : undefined;
  }

  /** 为已完成的章节注入整章译文 */
  injectDoneTranslation(lines: string[], translatedLines: string[]): void {
    this.segments = [
      {
        status: 'done',
        lines,
        translatedLines,
        error: null,
      },
    ];
    this.ready = true;
  }
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

  hasFailedChapters(): boolean {
    return this.chapters.some((chapter) => chapter.status === 'error');
  }

  resetFailedChapters(): boolean {
    let hasFailed = false;
    for (const chapter of this.chapters) {
      if (chapter.status !== 'error') continue;
      chapter.status = 'pending';
      const state = this.chapterStates.get(chapter.chapterId);
      if (state) state.errorMessage = undefined;
      this.chapterStates.delete(chapter.chapterId);
      hasFailed = true;
    }
    return hasFailed;
  }

  getStatus(chapterId: string): ChapterStatus | undefined {
    return this.chapters.find((c) => c.chapterId === chapterId)?.status;
  }

  updateStatus(chapterId: string, status: ChapterStatus): void {
    const ch = this.chapters.find((c) => c.chapterId === chapterId);
    if (ch) ch.status = status;
    if (status === 'done') {
      const state = this.chapterStates.get(chapterId);
      if (state) {
        // 预览可能仍持有状态引用，先释放文本，再移除工作区中的状态。
        state.segments = [];
        state.ready = false;
      }
      this.chapterStates.delete(chapterId);
    }
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
