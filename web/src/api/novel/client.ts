import ky from 'ky';

let tokenGetter: () => string = () => '';

export const client = ky.create({
  prefixUrl: '/api',
  timeout: 60000,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = tokenGetter();
        if (token) {
          request.headers.set('Authorization', 'Bearer ' + token);
        }
      },
    ],
  },
});

export const setTokenGetter = (getter: () => string) => {
  tokenGetter = getter;
};

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

  const xhr = new XMLHttpRequest();
  let settle = false;

  const promise = new Promise<string>(function (resolve, reject) {
    xhr.open('POST', url);
    const token = tokenGetter();
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    }

    xhr.onload = () => {
      if (settle) return;
      settle = true;
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(xhr.responseText));
      }
    };

    xhr.onerror = () => {
      if (settle) return;
      settle = true;
      reject(new Error('网络错误'));
    };

    xhr.onabort = () => {
      if (settle) return;
      settle = true;
      reject(new Error('上传已取消'));
    };

    xhr.upload.addEventListener('progress', (e) => {
      const percent = e.lengthComputable ? (e.loaded / e.total) * 100 : 0;
      onProgress(Math.ceil(percent));
    });
    xhr.send(formData);
  });

  const abort = () => {
    if (settle) return;
    xhr.abort();
  };

  return { promise, abort };
}
