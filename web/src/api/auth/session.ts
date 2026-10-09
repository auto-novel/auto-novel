import { createAuthApi } from '@novelia/auth-api';

export const authUrl = new URL(__AUTH_URL__, window.location.origin).href;

function getStorage() {
  try {
    // 与旧页面隔离会话格式；保留旧 auth 数据供旧标签页和回滚使用。
    // 首次启动由 auth-api 使用刷新 Cookie 获取含 uid 的新令牌，
    // 不导入旧 access token，避免格式不兼容或退出后恢复旧会话。
    return { key: 'auth-v2', target: window.localStorage };
  } catch {
    return undefined;
  }
}

export const authApi = createAuthApi({
  app: 'n',
  url: authUrl,
  storage: getStorage(),
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => authApi.dispose());
}
