import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationEngine } from '../src/engine';
import { Translator, TranslationTask, EngineCallbacks } from '../src/types';

describe('TranslationEngine', () => {
  let callbacks: EngineCallbacks;
  let engine: TranslationEngine;

  beforeEach(() => {
    // 模拟回调函数
    callbacks = {
      onTaskUpdate: vi.fn(),
      onQueueIdle: vi.fn(),
    };
    engine = new TranslationEngine(callbacks);
  });

  // 辅助函数：创建一个 Mock 翻译器
  const createMockTranslator = (
    id: string,
    type: any = 'gpt',
    concurrency = 1,
  ): Translator => ({
    id,
    type,
    concurrency,
    translate: vi.fn().mockImplementation(async (task: TranslationTask) => {
      // 模拟异步翻译过程
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        taskId: task.id,
        status: 'success',
        translatedText: `translated: ${task.text}`,
      };
    }),
  });

  it('应该能正常添加任务并由匹配的翻译器执行', async () => {
    const translator = createMockTranslator('t1', 'gpt');
    engine.updateTranslator(translator);

    const taskId = engine.addTask({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'zh',
      translatorType: 'gpt',
    });

    // 等待异步任务完成
    await vi.waitFor(() => {
      expect(callbacks.onTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ taskId, status: 'success' }),
      );
    });

    expect(translator.translate).toHaveBeenCalledTimes(1);
  });

  it('应该严格遵守翻译器的并发限制 (concurrency)', async () => {
    // 创建一个并发为 1 的翻译器
    const translator = createMockTranslator('t1', 'gpt', 1);
    let activeCalls = 0;

    // 重新定义 translate 以统计当前执行中的任务数
    translator.translate = vi.fn().mockImplementation(async () => {
      activeCalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeCalls--;
      return { taskId: 'any', status: 'success', translatedText: '' };
    });

    engine.updateTranslator(translator);

    // 同时添加三个任务
    engine.addTask({
      text: 'task1',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    });
    engine.addTask({
      text: 'task2',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    });
    engine.addTask({
      text: 'task3',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    });

    // 在极短时间内检查，活跃任务不应超过 1
    await new Promise((r) => setTimeout(r, 10));
    expect(activeCalls).toBe(1);
    expect(translator.translate).toHaveBeenCalledTimes(1);

    // 等待所有完成
    await vi.waitFor(() => {
      expect(translator.translate).toHaveBeenCalledTimes(2);
    });
  });

  it('如果没有匹配类型的翻译器，任务应留在队列中，直到翻译器被添加', async () => {
    const taskData = {
      text: 'test',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'baidu' as any,
    };

    // 先加任务，此时没有 baidu 翻译器
    const taskId = engine.addTask(taskData);
    expect(callbacks.onTaskUpdate).not.toHaveBeenCalled();

    // 随后添加 baidu 翻译器
    const baiduTranslator = createMockTranslator('b1', 'baidu');
    engine.updateTranslator(baiduTranslator);

    await vi.waitFor(() => {
      expect(callbacks.onTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ taskId, status: 'success' }),
      );
    });
  });

  it('当翻译器抛出异常时，应通过回调返回错误状态', async () => {
    const translator = createMockTranslator('t1', 'gpt');
    translator.translate = vi.fn().mockRejectedValue(new Error('网络崩溃'));

    engine.updateTranslator(translator);
    const taskId = engine.addTask({
      text: 'fail',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    });

    await vi.waitFor(() => {
      expect(callbacks.onTaskUpdate).toHaveBeenCalledWith({
        taskId,
        status: 'error',
        error: '网络崩溃',
      });
    });
  });

  it('删除翻译器后，不应再向其分配新任务', async () => {
    const translator = createMockTranslator('t1', 'gpt');
    engine.updateTranslator(translator);
    engine.removeTranslator('t1');

    engine.addTask({
      text: 'no-way',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    });

    // 等待一段时间，确认没有被调用
    await new Promise((r) => setTimeout(r, 50));
    expect(translator.translate).not.toHaveBeenCalled();
  });

  it('多翻译器协作：任务应分配给类型匹配且有空闲容量的翻译器', async () => {
    const t1 = createMockTranslator('t1', 'gpt', 1);
    const t2 = createMockTranslator('t2', 'gpt', 1);

    // 让 t1 处于忙碌状态
    t1.translate = vi.fn().mockReturnValue(new Promise(() => {})); // 永不完成

    engine.updateTranslator(t1);
    engine.updateTranslator(t2);

    engine.addTask({
      text: 'task1',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    }); // 会给 t1
    engine.addTask({
      text: 'task2',
      sourceLang: 'ja',
      targetLang: 'zh',
      translatorType: 'gpt',
    }); // 应给 t2

    await vi.waitFor(() => {
      expect(t2.translate).toHaveBeenCalled();
    });
    expect(t1.translate).toHaveBeenCalledTimes(1);
  });
});
