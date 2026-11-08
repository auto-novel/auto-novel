import type { Glossary, TranslationInput } from '@auto-novel/translator';

/** 领域身份：元数据不是章节，不需要伪造章节 ID。 */
export type TranslationUnitRef =
  | { readonly kind: 'chapter'; readonly chapterId: string }
  | { readonly kind: 'metadata' };

/** 初始化快照，不承载执行中的 UI 状态。 */
export interface TaskChapter {
  readonly kind: 'chapter';
  readonly chapterId: string;
  readonly title: string;
  readonly order: number;
  readonly completed: boolean;
}

/** 任务中的元数据翻译单元描述，不承载元数据内容或执行状态。 */
export interface TaskMetadataUnit {
  readonly kind: 'metadata';
  readonly title: string;
}

export interface TaskExecutionContext {
  signal: AbortSignal;
  onLog: (message: string) => void;
}

/** 保存后返回的小说章节统计，用于刷新独立翻译入口的数量显示。 */
export interface ChapterSaveResult {
  jp?: number;
  zh?: number;
}

/** 本次执行的原文与保存快照；保存闭包绑定准备时的版本和取消信号。 */
export interface PreparedUnit {
  readonly lines: readonly string[];
  readonly glossary: Glossary;
  readonly history?: TranslationInput['history'];
  save(translated: readonly string[]): Promise<void | ChapterSaveResult>;
}

export interface TranslationTask {
  readonly type: 'local' | 'web' | 'wenku';
  readonly chapters: readonly TaskChapter[];
  /** initialize 完成后为 true；调度层负责串行初始化同一任务版本。 */
  readonly initialized: boolean;
  /** 正式执行前初始化；网络小说先按需更新目录，再加载任务快照。 */
  initialize(context: TaskExecutionContext): Promise<void>;
  /** 独立于正文列表的元数据翻译单元。 */
  readonly metadataUnit?: TaskMetadataUnit;
  prepareUnit(
    unit: TranslationUnitRef,
    context: TaskExecutionContext,
  ): Promise<PreparedUnit>;
}
