/** OpenCode Go 的 OpenAI Chat Completions 兼容端点。 */
export const OPEN_CODE_GO_ENDPOINT =
  'https://opencode.ai/inference/go/openai/v1';

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
