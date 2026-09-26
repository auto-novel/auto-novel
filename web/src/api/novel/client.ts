import ky from 'ky';

import { authApi, localAuthToken } from '../auth/session';

export const client = authApi
  ? authApi.createClient('/api/', { timeout: 60_000 })
  : ky.create({
      prefix: '/api/',
      timeout: 60_000,
      retry: 0,
      headers: { Authorization: `Bearer ${localAuthToken}` },
    });

export type UploadTask<T> = {
  promise: Promise<T>;
  abort: () => void;
};

export function uploadFile(
  url: string,
  name: string,
  file: File,
  onProgress: (p: number) => void,
): UploadTask<string> {
  const formData = new FormData();
  formData.append(name, file);
  const controller = new AbortController();

  const promise = client
    .post(url, {
      body: formData,
      signal: controller.signal,
      timeout: false,
      // 使用 XHR 保留各浏览器的上传进度，认证和重试交由共享客户端处理。
      fetch: (input, init) => {
        const request = new Request(input, init);
        return new Promise<Response>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const abort = () => {
            xhr.abort();
            reject(new Error('上传已取消'));
          };
          if (request.signal.aborted) {
            abort();
            return;
          }
          xhr.open(request.method, request.url);
          request.headers.forEach((value, key) => {
            // 浏览器为实际发送的 FormData 生成 boundary。
            if (key.toLowerCase() !== 'content-type')
              xhr.setRequestHeader(key, value);
          });
          xhr.onload = () => {
            const headers = new Headers();
            for (const line of xhr
              .getAllResponseHeaders()
              .trim()
              .split(/[\r\n]+/)) {
              const separator = line.indexOf(':');
              if (separator > 0)
                headers.append(
                  line.slice(0, separator),
                  line.slice(separator + 1).trim(),
                );
            }
            resolve(
              new Response(
                [204, 205, 304].includes(xhr.status) ? null : xhr.responseText,
                {
                  status: xhr.status,
                  statusText: xhr.statusText,
                  headers,
                },
              ),
            );
          };
          xhr.onerror = () => reject(new Error('网络错误'));
          xhr.onabort = () => reject(new Error('上传已取消'));
          xhr.onloadend = () =>
            request.signal.removeEventListener('abort', abort);
          xhr.upload.onprogress = (event) => {
            onProgress(
              event.lengthComputable
                ? Math.ceil((event.loaded / event.total) * 100)
                : 0,
            );
          };
          request.signal.addEventListener('abort', abort, { once: true });
          xhr.send(formData);
        });
      },
    })
    .text();

  return { promise, abort: () => controller.abort() };
}
