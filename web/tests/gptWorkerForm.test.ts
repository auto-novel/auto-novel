import { describe, expect, it } from 'vite-plus/test';

import {
  validateGptWorker,
  validateGptWorkerBatch,
} from '../src/pages/workspace/worker/gptWorkerForm';

const worker = {
  id: 'worker',
  model: 'model',
  key: 'sk-key',
  endpoint: 'https://api.deepseek.com',
  concurrency: 1,
};

describe('GPT worker validation', () => {
  it('keeps required, unique-name, endpoint and integer concurrency checks', () => {
    expect(validateGptWorker(worker, [])).toEqual([]);
    expect(
      validateGptWorker({ ...worker, id: ' ', model: '', key: '' }, []).map(
        (error) => error.name,
      ),
    ).toEqual(['id', 'model', 'key']);
    expect(validateGptWorker(worker, [{ id: worker.id }])).toContainEqual({
      name: 'id',
      message: '名字不能重复',
    });
    for (const concurrency of [0, 101, 1.5, NaN]) {
      expect(validateGptWorker({ ...worker, concurrency }, [])).toContainEqual({
        name: 'concurrency',
        message: '并发数需为 1~100 的整数',
      });
    }
    for (const endpoint of ['', 'not a URL', 'ftp://example.com']) {
      expect(
        validateGptWorker({ ...worker, endpoint }, []).some(
          (error) => error.name === 'endpoint',
        ),
      ).toBe(true);
    }
    expect(
      validateGptWorker(
        { ...worker, concurrency: 100, endpoint: 'http://localhost:8080' },
        [],
      ),
    ).toEqual([]);
  });

  it('validates non-empty and duplicate batch lines after trimming', () => {
    const state = {
      endpoint: worker.endpoint,
      models: ' model-a\n\nmodel-b ',
      keys: ' sk-a\nsk-b ',
    };
    expect(validateGptWorkerBatch(state)).toEqual([]);
    expect(
      validateGptWorkerBatch({ ...state, models: ' \n', keys: '' }).map(
        (error) => error.name,
      ),
    ).toEqual(['models', 'keys']);
    expect(
      validateGptWorkerBatch({
        ...state,
        models: 'model\n model ',
        keys: 'key\nkey',
      }),
    ).toEqual([
      { name: 'models', message: '存在重复的模型名' },
      { name: 'keys', message: '存在重复的Key' },
    ]);
  });
});
