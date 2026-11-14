import type { FormError } from '@nuxt/ui';

export interface GptWorkerFormState {
  id: string;
  model: string;
  endpoint: string;
  key: string;
  concurrency: number;
}

export interface GptWorkerBatchFormState {
  endpoint: string;
  models: string;
  keys: string;
}

export const parseWorkerLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function validateEndpoint(endpoint: string): FormError[] {
  if (!endpoint.trim()) {
    return [{ name: 'endpoint', message: 'API端点不能为空' }];
  }
  try {
    const { protocol } = new URL(endpoint);
    if (protocol === 'http:' || protocol === 'https:') return [];
  } catch {
    // Fall through to the same error for malformed URLs and unsupported protocols.
  }
  return [{ name: 'endpoint', message: 'API端点不合法' }];
}

export function validateGptWorker(
  state: GptWorkerFormState,
  otherWorkers: readonly { id: string }[],
): FormError[] {
  const errors = validateEndpoint(state.endpoint);
  for (const [name, label] of [
    ['id', '名字'],
    ['model', '模型'],
    ['key', 'Key'],
  ] as const) {
    if (!state[name].trim()) errors.push({ name, message: `${label}不能为空` });
  }
  if (otherWorkers.some((worker) => worker.id === state.id)) {
    errors.push({ name: 'id', message: '名字不能重复' });
  }
  if (
    !Number.isInteger(state.concurrency) ||
    state.concurrency < 1 ||
    state.concurrency > 100
  ) {
    errors.push({ name: 'concurrency', message: '并发数需为 1~100 的整数' });
  }
  return errors;
}

export function validateGptWorkerBatch(
  state: GptWorkerBatchFormState,
): FormError[] {
  const errors = validateEndpoint(state.endpoint);
  for (const [name, label] of [
    ['models', '模型'],
    ['keys', 'Key'],
  ] as const) {
    const items = parseWorkerLines(state[name]);
    if (!items.length) {
      errors.push({ name, message: `请至少输入一个${label}` });
    } else if (new Set(items).size !== items.length) {
      errors.push({
        name,
        message: `存在重复的${label}${name === 'models' ? '名' : ''}`,
      });
    }
  }
  return errors;
}
