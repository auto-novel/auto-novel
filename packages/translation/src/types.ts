export type TranslatorType = 'baidu' | 'youdao' | 'gpt' | 'sakura';

export interface TranslationTask {
  id: string;
  text: string;
  sourceLang: string;
  targetLang: string;
  translatorType: TranslatorType;
  glossary?: Record<string, string>;
  metadata?: Record<string, string>;
}

export type TranslationResult = {
  taskId: string;
} & (
  | {
      status: 'success';
      translatedText: string;
    }
  | {
      status: 'error';
      error: string;
    }
);

export interface Translator {
  readonly id: string;
  readonly type: TranslatorType;
  readonly concurrency: number;
  translate(task: TranslationTask): Promise<TranslationResult>;
}

export interface EngineCallbacks {
  onTaskUpdate: (result: TranslationResult) => void;

  /**
   * Called when the entire queue is empty.
   */
  onQueueIdle?: () => void;
}
