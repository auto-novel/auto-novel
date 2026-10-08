import ky from 'ky';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/auth/session', () => ({
  authApi: {
    createClient: (prefix: string) =>
      ky.create({ prefix: `http://localhost${prefix}` }),
  },
}));

// 模拟 Ktor ContentNegotiation：Accept 不接受 JSON 时返回 406。
class FakeXHR {
  headers: Record<string, string> = {};
  status = 0;
  statusText = '';
  responseText = '';
  upload = { onprogress: null };
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  open() {}
  setRequestHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  getAllResponseHeaders() {
    return 'content-type: application/json';
  }
  send() {
    const accept = this.headers['accept'] ?? '*/*';
    if (accept.includes('json') || accept.includes('*/*')) {
      this.status = 200;
      this.responseText = '42';
    } else {
      this.status = 406;
    }
    this.onload?.();
    this.onloadend?.();
  }
  abort() {}
}

afterEach(() => vi.unstubAllGlobals());

describe('uploadFile', () => {
  it('accepts the JSON response returned by the server', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const { uploadFile } = await import('../src/api/novel/client');

    const task = uploadFile('upload', 'jp', new File(['a'], 'a.txt'), () => {});

    await expect(task.promise).resolves.toBe(42);
  });
});
