/** 通用 LLM 调用客户端：基于 pi-ai 适配协议，封装 SDK 与网关兼容细节。 */
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type {
  AssistantMessage,
  FetchFunction,
  Message,
  Model,
} from '@earendil-works/pi-ai';

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
  signal?: AbortSignal;
  fetch?: FetchFunction;
}

export interface PiAiCompletionResult {
  text: string;
  reasoning?: string;
  finishReason?: string;
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

export async function createPiAiCompletion(
  request: PiAiCompletionRequest,
): Promise<PiAiCompletionResult> {
  const model = createModel(
    request.protocol,
    request.model,
    normalizeEndpoint(request.endpoint, request.protocol),
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
    onPayload: (payload) => ({
      ...(payload as Record<string, unknown>),
      ...request.requestParams,
    }),
  });

  const result = await stream.result();
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
    inputTokens: result.usage.input,
    outputTokens: result.usage.output,
  };
}

function createModel(
  protocol: PiAiProtocol,
  id: string,
  baseUrl: string,
): Model<PiAiProtocol> {
  return {
    id,
    name: id,
    api: protocol,
    provider: 'auto-novel',
    baseUrl,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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

function createPiAiFetch(
  request: Pick<
    PiAiCompletionRequest,
    'protocol' | 'endpoint' | 'key' | 'fetch'
  >,
): FetchFunction {
  const fetch = request.fetch ?? globalThis.fetch;
  const isOpenRouterMessages =
    request.protocol === 'anthropic-messages' &&
    new URL(request.endpoint).hostname === 'openrouter.ai';

  return (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    // SDK metadata is not part of the API protocol and can fail gateway CORS.
    const sdkHeaders: string[] = [];
    headers.forEach((_, name) => {
      if (name.startsWith('x-stainless-') || name === 'user-agent') {
        sdkHeaders.push(name);
      }
    });
    for (const name of sdkHeaders) headers.delete(name);

    if (isOpenRouterMessages) {
      // OpenRouter requires Bearer auth and does not allow these Anthropic headers.
      headers.set('authorization', `Bearer ${request.key}`);
      headers.delete('x-api-key');
      headers.delete('anthropic-version');
      headers.delete('anthropic-dangerous-direct-browser-access');
      headers.delete('anthropic-beta');
    }

    return fetch(input, { ...init, headers });
  };
}
