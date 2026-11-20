import { isHTTPError } from 'ky';

import { client } from './client';

/** 只识别官方 Go Chat 端点；自定义网关沿用调用方自己的传输。 */
export function isOpenCodeGoEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.origin === 'https://opencode.ai' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^(?:\/inference\/go\/(?:openai\/)?v1|\/zen\/go\/v1)(?:\/chat\/completions)?\/?$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}

export const fetchOpenCodeGo: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!isOpenCodeGoEndpoint(url))
    throw new TypeError('仅支持 OpenCode Go 官方接口');

  const request = new Request(input, init);
  if (request.method !== 'POST') {
    throw new TypeError('OpenCode Go 只支持 Chat Completions POST 请求');
  }
  const authorization = request.headers.get('authorization');
  const key = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!key) throw new TypeError('OpenCode Go Key 不能为空');
  const sessionId = request.headers.get('x-opencode-session');
  if (!sessionId) throw new TypeError('缺少 OpenCode 会话 ID');
  request.signal.throwIfAborted();

  // Authorization 由共享客户端填入本站登录凭据，不能使用 Go Key 覆盖。
  // 不转发 Cookie、SDK 元数据或调用方指定的地址/请求头。
  let errorResponse: Response | undefined;
  try {
    return await client.post('translator/opencode-go/chat/completions', {
      headers: {
        'content-type': 'application/json',
        'x-opencode-key': key,
        'x-opencode-session': sessionId,
      },
      body: await request.text(),
      signal: request.signal,
      redirect: 'error',
      credentials: 'omit',
      timeout: false,
      hooks: {
        afterResponse: [
          ({ response }) => {
            // ky 会消费 HTTPError 的正文。只为错误保留副本，成功的 SSE 不做 tee。
            void errorResponse?.body?.cancel().catch(() => {});
            errorResponse = response.ok ? undefined : response.clone();
          },
        ],
      },
    });
  } catch (error) {
    // 共享客户端仍处理本站登录刷新。服务商状态码和正文交回翻译流水线。
    if (isHTTPError(error)) return errorResponse ?? error.response;
    throw error;
  }
};
