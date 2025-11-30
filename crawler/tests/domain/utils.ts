import { Impit } from 'impit';
import ky from 'ky';

export const buildClientForTest = () => {
  const impitDefaults = {
    timeout: 30_000,
    browser: 'chrome',
    followRedirects: true,
  };

  const client = new Impit({
    ...impitDefaults,
  } as any);

  const fetcher = async (input, init) => {
    const requestInit = init
      ? {
          ...init,
          method: init.method ? init.method : undefined,
          body: init.body === null ? undefined : init.body,
        }
      : undefined;
    const response = await client.fetch(input, requestInit);
    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  return ky.create({ fetch: fetcher });
};
