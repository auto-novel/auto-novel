import { HTTPError, TimeoutError } from 'ky-auth';
import {
  HTTPError as LegacyHTTPError,
  TimeoutError as LegacyTimeoutError,
} from 'ky';

export * from './novel';

export const formatError = async (error: unknown) => {
  if (error instanceof HTTPError || error instanceof LegacyHTTPError) {
    let messageOverride: string | null = null;
    if (error.response.status === 429) {
      messageOverride = '操作额度耗尽，等明天再试吧';
    }
    const detail =
      error instanceof LegacyHTTPError
        ? await error.response.text().catch(() => error.message)
        : typeof error.data === 'string'
          ? error.data
          : error.data === undefined
            ? error.message
            : JSON.stringify(error.data);
    return `[${error.response.status}]${messageOverride ?? detail}`;
  } else if (
    error instanceof TimeoutError ||
    error instanceof LegacyTimeoutError
  ) {
    return '请求超时';
  } else if (error instanceof Error) {
    return error.message || error.name || '未知错误';
  } else {
    return `${error}`;
  }
};
