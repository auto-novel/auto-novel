import { HTTPError, type Options, type ShouldRetryState } from 'ky';
import { isNonRetryableServerError } from './serverError';

const nonRetryStatusCodes = [
  400, // Bad Request，参数错误
  401, // Unauthorized，未登录 / token 无效
  403, // Forbidden，无权限 / 被屏蔽 / 法规限制
  404, // Not Found，资源不存在
  405, // Method Not Allowed
  406, // Not Acceptable
  409, // Conflict，资源冲突
  410, // Gone，资源已删除
  412, // Precondition Failed
  415, // Unsupported Media Type
  422, // Unprocessable Content，业务校验失败
  451, // Unavailable For Legal Reasons，法律原因不可用

  // CloudFlare
  520, // Web Server Returned an Unknown Error，常见于源站异常/协议问题，重试收益低
  525, // SSL Handshake Failed，配置问题
  526, // Invalid SSL Certificate，配置问题
  530, // Origin DNS Error / Cloudflare routing/config problem
];

const shouldRetry = async (state: ShouldRetryState) => {
  const error = state.error;
  if (error instanceof HTTPError) {
    if (await isNonRetryableServerError(error)) {
      return false;
    }
    if (nonRetryStatusCodes.includes(error.response.status)) {
      return false;
    }
  }
  return true; // 其他错误正常重试
};

export const defaultKyClientConfig = {
  retry: { shouldRetry },
} satisfies Options;
