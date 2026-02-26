import ky from 'ky';

export const AuthUrl = (() => {
  const { protocol, hostname, host, origin } = window.location;

  // 让 kuriko 的开发环境可以跑起来，后续需要支持开发环境免登录
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]';

  if (isLocalHost) {
    return origin;
  }

  // 不考虑 a.co.uk 这种顶级域名
  //  n.novelia.cc => auth.novelia.cc
  //  test.com => auth.test.com
  const parts = host.split('.');
  const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : host;
  return `${protocol}//auth.${baseDomain}`;
})();

const client = ky.create({
  prefixUrl: AuthUrl + '/api/v1',
  credentials: 'include',
});

export const AuthApi = {
  refresh: (app: string) =>
    client.post(`auth/refresh`, { searchParams: { app } }).text(),
  logout: () => client.post(`auth/logout`).text(),
};
