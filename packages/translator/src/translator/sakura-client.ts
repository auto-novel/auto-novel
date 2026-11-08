// Copyright 2023 OpenAI
import ky, { type Options } from 'ky';

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
