import { HTTPError, TimeoutError } from 'ky';

export * from './auth';
export * from './novel';

export const formatError = async (error: unknown) => {
  if (error instanceof HTTPError) {
    let messageOverride: string | null = null;
    if (error.response.status === 429) {
      messageOverride = '操作额度耗尽，等明天再试吧';
    }
    if (error.response.status === 401) {
      messageOverride = '未登录或登录状态过期，请登录后重试';
    }
    const body = error.response.text().catch(() => '未知错误');
    const msg = await body.then(
      (message) => `[${error.response.status}]${messageOverride ?? message}`,
    );
    return msg;
  } else if (error instanceof TimeoutError) {
    return '请求超时';
  } else if (error instanceof Error) {
    return error.message || error.name || '未知错误';
  } else {
    return `${error}`;
  }
};
