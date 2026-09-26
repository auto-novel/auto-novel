import { HTTPError, TimeoutError } from 'ky';

export * from './novel';

export const formatError = async (error: unknown) => {
  if (error instanceof HTTPError) {
    let messageOverride: string | null = null;
    if (error.response.status === 429) {
      messageOverride = '操作额度耗尽，等明天再试吧';
    }
    const detail =
      typeof error.data === 'string'
        ? error.data
        : error.data === undefined
          ? error.message
          : JSON.stringify(error.data);
    return `[${error.response.status}]${messageOverride ?? detail}`;
  } else if (error instanceof TimeoutError) {
    return '请求超时';
  } else if (error instanceof Error) {
    return error.message || error.name || '未知错误';
  } else {
    return `${error}`;
  }
};
