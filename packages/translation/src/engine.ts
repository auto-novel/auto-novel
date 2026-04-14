import {
  type EngineCallbacks,
  type TranslationTask,
  type Translator,
} from './types';
import { Mutex } from 'async-mutex';
import { v4 as uuidv4 } from 'uuid';

export class TranslationEngine {
  private translators = new Map<string, Translator>();
  private readonly taskQueue: TranslationTask[] = [];
  private readonly callbacks: EngineCallbacks;
  private readonly mutex = new Mutex();
  private readonly activeCounts = new Map<string, number>();

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
  }

  public updateTranslator(translator: Translator): void {
    this.translators.set(translator.id, translator);
    if (!this.activeCounts.has(translator.id)) {
      this.activeCounts.set(translator.id, 0);
    }
    this.tryProcessQueue();
  }

  public removeTranslator(id: string): void {
    this.translators.delete(id);
  }

  public addTask(task: Omit<TranslationTask, 'id'>): string {
    const taskId = uuidv4();
    this.mutex.runExclusive(() => {
      this.taskQueue.push({ id: taskId, ...task } as TranslationTask);
      this.tryProcessQueue();
    });
    return taskId;
  }

  private tryProcessQueue(): void {
    if (this.taskQueue.length === 0) {
      return;
    }
    // 遍历队列中的任务，寻找匹配且有空闲的翻译器
    for (let i = this.taskQueue.length - 1; i >= 0; i--) {
      const task = this.taskQueue[i];

      const availableTranslators = Array.from(this.translators.values()).filter(
        (t) => t.type === task.translatorType,
      );

      const targetTranslator = availableTranslators.find((t) => {
        const count = this.activeCounts.get(t.id) || 0;
        return count < t.concurrency;
      });

      if (targetTranslator) {
        this.taskQueue.splice(i, 1);
        this.startTask(task, targetTranslator);
      }
    }
  }

  private async startTask(task: TranslationTask, translator: Translator) {
    const currentCount = this.activeCounts.get(translator.id) || 0;
    this.activeCounts.set(translator.id, currentCount + 1);

    try {
      const result = await translator.translate(task);
      this.callbacks.onTaskUpdate(result);
    } catch (e: any) {
      this.callbacks.onTaskUpdate({
        taskId: task.id,
        status: 'error',
        error: e.message || '未知翻译错误',
      });
    } finally {
      await this.mutex.runExclusive(() => {
        const currentCount = this.activeCounts.get(translator.id) ?? 0;
        const newCount = Math.max(0, currentCount - 1);
        // 如果计数归零，且该翻译器已经被 removeTranslator 了
        if (newCount === 0 && !this.translators.has(translator.id)) {
          this.activeCounts.delete(translator.id);
        } else {
          this.activeCounts.set(translator.id, newCount);
        }
        this.tryProcessQueue();
      });
    }
  }
}
