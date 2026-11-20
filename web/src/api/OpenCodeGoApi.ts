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
      // 仅让 401 进入原站客户端的登录刷新流程，其余响应直接交给 SDK。
      throwHttpErrors: (status) => status === 401,
    });
  } catch (error) {
    if (!isHTTPError(error)) throw error;
    const body =
      typeof error.data === 'string' ? error.data : JSON.stringify(error.data);
    return new Response(body, {
      status: error.response.status,
      headers: error.response.headers,
    });
  }
};
