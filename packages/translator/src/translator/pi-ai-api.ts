import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type {
  AssistantMessage,
  FetchFunction,
  Message,
  Model,
  ModelCost,
  Usage,
} from '@earendil-works/pi-ai';
import { createPiAiFetch } from './pi-ai-fetch';

export type PiAiProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages';

export interface PiAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PiAiCompletionRequest {
  protocol: PiAiProtocol;
  endpoint: string;
  key: string;
  model: string;
  messages: PiAiMessage[];
  requestParams?: Record<string, unknown>;
  cost?: ModelCost;
  onUsage?: (usage: Usage) => void;
  signal?: AbortSignal;
  fetch?: FetchFunction;
}

export interface PiAiCompletionResult {
  text: string;
  reasoning?: string;
  finishReason?: string;
  /** 完整 pi-ai 用量：input 是未命中缓存的输入，output 已包含 reasoning。 */
  usage: Usage;
  /** 兼容原接口，等于 usage.input（不含缓存）。 */
  inputTokens?: number;
  outputTokens?: number;
}

export class PiAiRequestError extends Error {
  constructor(
    readonly protocol: PiAiProtocol,
    readonly status: number | undefined,
    message: string,
  ) {
    super(
      `${protocol}${status === undefined ? '' : ` HTTP ${status}`}：${message}`,
    );
    this.name = 'PiAiRequestError';
  }
}

const streams = {
  'openai-completions': openAICompletionsApi(),
  'openai-responses': openAIResponsesApi(),
  'anthropic-messages': anthropicMessagesApi(),
} as const;

interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  output_tokens_details?: { reasoning_tokens?: number };
}

export async function createPiAiCompletion(
  request: PiAiCompletionRequest,
): Promise<PiAiCompletionResult> {
  const model = createModel(
    request.protocol,
    request.model,
    normalizeEndpoint(request.endpoint, request.protocol),
    request.cost,
  );
  const messages: Message[] = request.messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: [{ type: 'text', text: message.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      } satisfies Message;
    }
    if (message.role === 'system') {
      return {
        role: 'system',
        content: message.content,
        timestamp: Date.now(),
      } satisfies Message;
    }
    return {
      role: 'user',
      content: message.content,
      timestamp: Date.now(),
    } satisfies Message;
  });
  const context = normalizeContext({ messages });
  const fetch = createPiAiFetch(request);
  let status: number | undefined;
  let failedUsage: Usage | undefined;
  const stream = streams[request.protocol].stream(model, context, {
    apiKey: request.key,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      status = response.status;
      return response;
    },
    signal: request.signal,
    maxRetries: 0,
    cacheRetention: 'none',
    // pi-ai 在 response.failed 分支直接抛错，尚未解析其终态 usage。
    onProviderStreamEvent:
      request.protocol === 'openai-responses'
        ? async (data) => {
            const event = data as {
              type: string;
              response: { usage?: ResponsesUsage };
            };
            if (event.type !== 'response.failed' || !event.response.usage)
              return;
            const raw = event.response.usage;
            const cacheRead = raw.input_tokens_details?.cached_tokens ?? 0;
            const cacheWrite =
              raw.input_tokens_details?.cache_write_tokens ?? 0;
            failedUsage = {
              input: raw.input_tokens - cacheRead - cacheWrite,
              output: raw.output_tokens,
              cacheRead,
              cacheWrite,
              reasoning: raw.output_tokens_details?.reasoning_tokens,
              totalTokens: raw.total_tokens,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            };
            const { calculateCost } = await import(
              '@earendil-works/pi-ai/models'
            );
            calculateCost(model, failedUsage);
          }
        : undefined,
    onPayload: (payload) => ({
      ...(payload as Record<string, unknown>),
      ...request.requestParams,
    }),
  });

  const result = await stream.result();
  const usage = failedUsage ?? result.usage;
  // 即使输出被截断、取消或随后校验失败，已发生的用量也需要保留。
  request.onUsage?.(usage);
  if (result.stopReason === 'aborted') {
    throw new DOMException(
      result.errorMessage || 'Request aborted',
      'AbortError',
    );
  }
  if (result.stopReason !== 'stop') {
    throw new PiAiRequestError(
      request.protocol,
      status,
      result.errorMessage ||
        (result.stopReason === 'length'
          ? '输出被截断，已达到输出 token 上限'
          : `响应未完成：${result.stopReason}`),
    );
  }

  const text = result.content
    .filter(
      (
        content,
      ): content is Extract<
        AssistantMessage['content'][number],
        { type: 'text' }
      > => content.type === 'text',
    )
    .map((content) => content.text)
    .join('');
  if (text.length === 0) {
    throw new PiAiRequestError(request.protocol, status, '响应正文为空');
  }
  const reasoning = result.content
    .filter(
      (
        content,
      ): content is Extract<
        AssistantMessage['content'][number],
        { type: 'thinking' }
      > => content.type === 'thinking',
    )
    .map((content) => content.thinking)
    .join('');

  return {
    text,
    reasoning: reasoning || undefined,
    finishReason: result.stopReason,
    usage,
    inputTokens: usage.input,
    outputTokens: usage.output,
  };
}

function createModel(
  protocol: PiAiProtocol,
  id: string,
  baseUrl: string,
  cost: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
): Model<PiAiProtocol> {
  return {
    id,
    name: id,
    api: protocol,
    provider: 'auto-novel',
    baseUrl,
    input: ['text'],
    cost,
    // Required pi-ai metadata; effort is supplied explicitly by the profile.
    reasoning: false,
    contextWindow: 0,
    maxTokens: 16_384,
    compat:
      protocol === 'openai-completions'
        ? {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: true,
            supportsUsageInStreaming: false,
            thinkingFormat: 'openai',
          }
        : protocol === 'openai-responses'
          ? { supportsDeveloperRole: false }
          : undefined,
  };
}

function normalizeEndpoint(endpoint: string, protocol: PiAiProtocol): string {
  const url = new URL(endpoint);
  let pathname = url.pathname.replace(/\/+$/, '');
  if (protocol === 'anthropic-messages') {
    pathname = pathname
      .replace(/\/(?:v1\/)?messages$/, '')
      .replace(/\/v1$/, '');
  } else {
    pathname = pathname.replace(/\/(?:chat\/completions|responses)$/, '');
    if (!pathname || pathname === '/') pathname = '/v1';
  }
  url.pathname = pathname || '/';
  return url.toString().replace(/\/$/, '');
}
