import ky from 'ky';

export const AuthUrl = (() => {
  const { protocol, host, port } = window.location;
  console.log('AuthUrl calculation:', { protocol, host, port });

  if (host.startsWith('localhost:')) {
    if (port === '5173') {
      // NOTE(kuriko): pnpm dev 情况下，Auth 转发到 n.novelia.cc
      return 'https://n.novelia.cc';
    } else {
      // NOTE(kuriko): 本地开发情况，Caddy 代理其他端口，转发到 5173
      //   此时默认 Auth 服务部署在 8000 端口
      return `${protocol}//localhost:8000`;
    }
  }

  // ALERT(kuriko): 这里不考虑 a.co.uk 这种顶级域名。
  //  books.fishhawk.top => auth.fishhawk.top
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
