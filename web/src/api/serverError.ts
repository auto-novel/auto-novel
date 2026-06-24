import { HTTPError } from 'ky';

export const ServerErrorMsg = {
  TokenExpired: 'Token不合法或者过期',
  CrawlerFailed: '从源站获取失败',
  FascismContentBlocked: '该小说包含法西斯内容，不予显示',
  ChapterNotFound: '章节不存在',
} as const;

const nonRetryableServerErrorMessages = [
  ServerErrorMsg.TokenExpired,
  ServerErrorMsg.FascismContentBlocked,
  ServerErrorMsg.CrawlerFailed,
];

export const isNonRetryableServerError = async (error: Error) => {
  const message =
    error instanceof HTTPError
      ? await error.response
          .clone()
          .text()
          .catch(() => '')
      : error.message;

  return nonRetryableServerErrorMessages.some((msg) => message.includes(msg));
};
