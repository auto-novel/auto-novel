// Copyright 2023 OpenAI
import ky, { isHTTPError, type Options } from 'ky';

/** 优先显示常见 API 错误字段，其余 JSON 保留结构以便排查。 */
const describeErrorData = (data: unknown): string => {
  if (typeof data === 'string') return data.trim();
  if (data === null || data === undefined) return '';
  if (typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail']) {
      if (record[key] === undefined) continue;
      const detail = describeErrorData(record[key]);
      if (detail) return detail;
    }
  }
  return JSON.stringify(data) ?? '';
};

export const createOpenAiApi = (endpoint: string, key: string) => {
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.pathname === '/') {
    endpointUrl.pathname = 'v1';
  }

  const client = ky.create({
    prefix: endpointUrl.href,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: 600_000,
    retry: 0,
    hooks: {
      beforeError: [
        ({ error }) => {
          if (isHTTPError(error)) {
            // ky 2 已消费响应体，错误正文应从 data 读取。
            const detail = describeErrorData(error.data);
            if (detail) {
              const summary =
                detail.length > 2000 ? `${detail.slice(0, 2000)}…` : detail;
              error.message = `${error.message}；服务端错误：${summary}`;
            }
          }
          return error;
        },
      ],
    },
  });

  const listModels = (options?: Options): Promise<ModelsPage> =>
    client.get('models', options).json<ModelsPage>();

  const createChatCompletions = (
    json: ChatCompletionParams,
    options?: Options,
  ): Promise<ChatCompletion> =>
    client
      .post('chat/completions', { json, ...options })
      .json<ChatCompletion>();

  return {
    listModels,
    createChatCompletions,
  };
};

interface ModelsPage {
  data: Array<{ id: string; meta: unknown }>;
}

interface ChatCompletionParams {
  [key: string]: unknown;
  model: string;
  messages: Array<{
    content: string;
    role: 'system' | 'user' | 'assistant';
  }>;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  frequency_penalty?: number | null;
  stream?: false;
}

interface ChatCompletion {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { completion_tokens: number };
}
