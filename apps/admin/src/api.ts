import {
  uploadFile,
  type UploadFileOptions,
  type WebKitContext,
} from '@novelia/web-kit';
import { inject, type InjectionKey } from 'vue';

export interface Banner {
  id: number;
  type: 0;
  key: string;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  focalX: number;
  focalY: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BannerInput {
  type: 0;
  key: string;
  linkUrl: string | null;
  sortOrder: number;
  focalX: number;
  focalY: number;
}

interface BannerUpload {
  key: string;
  uploadUrl: string;
  imageUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

const imageTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];
export const imageAccept = imageTypes.join(',');
export const maxImageBytes = 500 * 1024;

/** 添加图片时只校验格式，大小留到上传前（压缩后）再校验。 */
export function validateImageType(file: Pick<File, 'type'>) {
  if (!imageTypes.includes(file.type)) {
    throw new Error('图片必须为 JPEG、PNG、WebP、GIF 或 AVIF');
  }
}

export function validateImage(file: Pick<File, 'size' | 'type'>) {
  validateImageType(file);
  if (file.size <= 0) throw new Error('图片内容为空');
  if (file.size > maxImageBytes) {
    throw new Error(`图片大小不能超过 ${maxImageBytes / 1024} KB`);
  }
}

export function validLink(value: string) {
  const link = value.trim();
  if (!link) return true;
  if (/[\r\n\\]/.test(link) || link.includes('\0')) return false;
  if (link.startsWith('/')) return !link.startsWith('//');
  try {
    const url = new URL(link);
    return (
      /^https?:$/.test(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// 图片直传不使用带身份认证的 API client，避免向对象存储发送 access token。
export function createBannerApi(
  client: ReturnType<WebKitContext['createClient']>,
) {
  return {
    list() {
      return client
        .get('admin/banner/', { searchParams: { type: 0 } })
        .json<Banner[]>();
    },
    create(input: BannerInput) {
      return client.post('admin/banner/', { json: input }).json<Banner>();
    },
    update(id: number, input: BannerInput) {
      return client.put(`admin/banner/${id}`, { json: input }).json<Banner>();
    },
    async setActive(id: number, active: boolean) {
      const path = `admin/banner/${id}/active`;
      if (active) await client.put(path);
      else await client.delete(path);
    },
    async remove(id: number) {
      await client.delete(`admin/banner/${id}`);
    },
    async upload(
      file: File,
      options: Pick<UploadFileOptions, 'onProgress' | 'signal'> = {},
    ) {
      validateImage(file);
      const upload = await client
        .post('admin/banner/upload', {
          json: { contentType: file.type, size: file.size },
          signal: options.signal,
        })
        .json<BannerUpload>();
      await uploadFile(file, {
        url: upload.uploadUrl,
        method: 'PUT',
        bodyType: 'file',
        headers: upload.headers,
        withCredentials: false,
        onProgress: options.onProgress,
        signal: options.signal,
      });
      return { key: upload.key, imageUrl: upload.imageUrl };
    },
  };
}

export type BannerApi = ReturnType<typeof createBannerApi>;
export const bannerApiKey: InjectionKey<BannerApi> = Symbol('banner-api');
export function useBannerApi() {
  const api = inject(bannerApiKey);
  if (!api) throw new Error('Banner API 尚未注册');
  return api;
}
