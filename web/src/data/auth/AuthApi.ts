import ky from 'ky';

const client = ky.create({
  prefixUrl: 'https://auth.novelia.cc/api/v1',
  timeout: 60000,
  credentials: 'include',
});

const refresh = () =>
  client.post(`auth/refresh`, { searchParams: { app: 'n' } }).text();
const logout = () => client.post(`auth/logout`).text();

export const AuthApi = {
  refresh,
  logout,
};
