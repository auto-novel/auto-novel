import { uploadFile } from '@novelia/web-kit';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { createBannerApi } from './api';

vi.mock('@novelia/web-kit', () => ({ uploadFile: vi.fn() }));

const presigned = {
  key: 'banner/test.png',
  uploadUrl: 'https://storage.example/banner/test.png?signature=test',
  imageUrl: 'https://images.example/banner/test.png',
  headers: { 'Content-Type': 'image/png' },
};
const post = vi.fn();
const api = createBannerApi({ post } as unknown as Parameters<
  typeof createBannerApi
>[0]);

beforeEach(() => {
  vi.resetAllMocks();
  post.mockReturnValue({ json: async () => presigned });
});

it('使用预签名参数直传原文件，不携带身份凭据', async () => {
  const file = new File(['image'], 'test.png', { type: 'image/png' });
  const signal = new AbortController().signal;
  const onProgress = vi.fn();

  await expect(api.upload(file, { signal, onProgress })).resolves.toEqual({
    key: presigned.key,
    imageUrl: presigned.imageUrl,
  });
  expect(post).toHaveBeenCalledWith('admin/banner/upload', {
    json: { contentType: file.type, size: file.size },
    signal,
  });
  expect(uploadFile).toHaveBeenCalledWith(file, {
    url: presigned.uploadUrl,
    method: 'PUT',
    bodyType: 'file',
    headers: presigned.headers,
    withCredentials: false,
    onProgress,
    signal,
  });
});

it('图片超过限制时不申请上传', async () => {
  const file = new File([new Uint8Array(500 * 1024 + 1)], 'large.png', {
    type: 'image/png',
  });
  await expect(api.upload(file)).rejects.toThrow('不能超过 500 KB');
  expect(post).not.toHaveBeenCalled();
  expect(uploadFile).not.toHaveBeenCalled();
});
