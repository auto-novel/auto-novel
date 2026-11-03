import type { Segment, SegmentTracker } from '@auto-novel/translator';
import type { TaskChapter, TaskMetadataUnit } from './tasks/task';

export type UnitStatus = 'pending' | 'translating' | 'done' | 'error';
export type SegmentStatus = 'pending' | 'translating' | 'done' | 'error';

export interface UnitState {
  readonly kind: 'chapter' | 'metadata';
  /** UI 跟踪键；元数据键不作为远程章节 ID 使用。 */
  readonly chapterId: string;
  title: string;
  order: number;
  status: UnitStatus;
  segmentProgress?: { completed: number; total: number };
}

export interface SegmentState {
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

export class UnitDetailState implements SegmentTracker {
  readonly chapterId: string;
  /** 获取原文、保存译文等单元级错误，与分段翻译错误独立。 */
  errorMessage: string | undefined = undefined;
  segments: SegmentState[] = [];
  /** 是否完成 Segment 切分 */
  ready = false;

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
    return reactive(this) as UnitDetailState;
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
    const segment = this.segments[segmentOrder];
    return segment?.status === 'error'
      ? errorMessage(segment.error)
      : undefined;
  }
}

export class TaskState {
  chapters: UnitState[] = [];
  metadataUnit?: UnitState;
  readonly unitDetails = new Map<string, UnitDetailState>();
  /** initialize 执行完毕后设为 true */
  initialized = false;

  initialize(
    chapters: readonly TaskChapter[],
    metadataUnit?: TaskMetadataUnit,
  ): void {
    this.unitDetails.clear();
    this.chapters = chapters.map((chapter) => ({
      kind: chapter.kind,
      chapterId: chapter.chapterId,
      title: chapter.title,
      order: chapter.order,
      status: chapter.completed ? 'done' : 'pending',
    }));
    // 仅供 UI 跟踪使用；不限制真实章节 ID，也不把此键传给 Task。
    const chapterIds = new Set(chapters.map((chapter) => chapter.chapterId));
    let metadataKey = '\u0000metadata';
    while (chapterIds.has(metadataKey)) metadataKey += '\u0000';
    this.metadataUnit = metadataUnit
      ? {
          kind: 'metadata',
          chapterId: metadataKey,
          title: metadataUnit.title,
          order: -1,
          status: 'pending',
        }
      : undefined;
    this.initialized = true;
  }

  /** 正文章节进度；元数据只参与任务完成判断，不计入章节数量。 */
  get progress(): { finished: number; error: number; total: number } {
    let finished = 0;
    let error = 0;
    for (const chapter of this.chapters) {
      if (chapter.status === 'done') finished++;
      else if (chapter.status === 'error') error++;
    }
    return { finished, error, total: this.chapters.length };
  }

  get units(): UnitState[] {
    return this.metadataUnit
      ? [this.metadataUnit, ...this.chapters]
      : this.chapters;
  }

  /** 仅用于展示：中止后回到等待，但仍有已完成或失败分段可供预览。 */
  isPausedUnit(unit: UnitState): boolean {
    if (unit.status !== 'pending') return false;
    const detail = this.unitDetails.get(unit.chapterId);
    return (
      !!detail?.ready &&
      detail.segments.some(
        (segment) => segment.status === 'done' || segment.status === 'error',
      )
    );
  }

  hasFailedUnits(): boolean {
    return this.units.some((chapter) => chapter.status === 'error');
  }

  resetFailedUnits(): boolean {
    let hasFailed = false;
    for (const chapter of this.units) {
      if (chapter.status !== 'error') continue;
      chapter.status = 'pending';
      const state = this.unitDetails.get(chapter.chapterId);
      if (state) state.errorMessage = undefined;
      this.unitDetails.delete(chapter.chapterId);
      hasFailed = true;
    }
    return hasFailed;
  }

  updateStatus(chapterId: string, status: UnitStatus): void {
    const ch = this.units.find((c) => c.chapterId === chapterId);
    if (ch) ch.status = status;
    if (status === 'done') {
      const state = this.unitDetails.get(chapterId);
      if (state) {
        // 预览可能仍持有状态引用，先释放文本，再移除工作区中的状态。
        state.segments = [];
        state.ready = false;
      }
      this.unitDetails.delete(chapterId);
    }
  }

  getUnitDetails(chapterId: string): UnitDetailState | undefined {
    if (!this.units.some((c) => c.chapterId === chapterId)) return undefined;
    let state = this.unitDetails.get(chapterId);
    if (!state) {
      state = new UnitDetailState(chapterId);
      this.unitDetails.set(chapterId, state);
    }
    return state;
  }
}
