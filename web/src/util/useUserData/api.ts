import ky from 'ky';

export const AuthUrl = (() => {
  const url = new URL(window.location.href);
  const host = url.host;
  const protocol = url.protocol;
  const parts = host.split('.');
  if (parts.length > 2) {
    // e.g. n.novelia.cc
    return `${protocol}//auth.${parts.slice(1).join('.')}`;
  } else if (parts.length == 2) {
    // e.g novelia.com
    return `${protocol}//auth.${host}`;
  } else if (host === 'localhost') {
    // NOTE(kuriko): For auth developing, please run auth server at port 4000
    return `${protocol}//localhost:4000`;
  } else {
    throw new Error('Unsupported hostname format');
  }
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
