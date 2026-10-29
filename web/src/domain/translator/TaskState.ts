import type { SegmentTracker, LineRange } from '@auto-novel/translator';
import type {
  HarnessReasoningRecord,
  HarnessUsageRecord,
} from '@auto-novel/translator/harness';

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
  /** 获取原文、保存译文等章节级错误，与分段翻译错误独立。 */
  errorMessage: string | undefined = undefined;
  ranges: LineRange[] = [];
  segments: SegmentInfo[] = [];
  /** 当前工作区内的请求用量；不持久化到章节数据。 */
  harnessUsage: HarnessUsageRecord[] = [];
  /** 按请求顺序记录的思考内容；与 harnessUsage 一样只存在内存里。 */
  reasoning: HarnessReasoningRecord[] = [];
  /** 当前章节是否走 Harness；用于预览界面决定是否显示运行轨迹。 */
  harness = false;
  /** 是否完成 Segment 切分 */
  ready = false;

  /** 汇总当前章节的 token 与人民币估算费用。 */
  get harnessUsageTotal() {
    const total = {
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: undefined as number | undefined,
      totalTokens: 0,
      estimatedCost: 0,
    };
    for (const { usage } of this.harnessUsage) {
      total.uncachedInputTokens += usage.input;
      total.cacheReadTokens += usage.cacheRead;
      total.cacheWriteTokens += usage.cacheWrite;
      total.outputTokens += usage.output;
      if (usage.reasoning !== undefined) {
        total.reasoningTokens = (total.reasoningTokens ?? 0) + usage.reasoning;
      }
      total.totalTokens += usage.totalTokens;
      total.estimatedCost += usage.cost.total;
    }
    return total;
  }

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

  /** 重试清理译文和思考轨迹，保留已发生的请求用量。 */
  resetSegments(): void {
    this.ranges = [];
    this.segments = [];
    this.reasoning = [];
    this.errorMessage = undefined;
    this.ready = false;
  }

  onSegmentsReady(lines: string[], ranges: LineRange[]): void {
    this.ranges = ranges;
    this.reasoning = [];
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
      this.chapterStates.get(chapter.chapterId)?.resetSegments();
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
        // 预览可能仍持有状态引用，先释放正文，再移除工作区中的状态。
        state.segments = [];
        state.ranges = [];
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
