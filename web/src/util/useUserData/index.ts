import { jwtDecode } from 'jwt-decode';
import { HTTPError } from 'ky';

import { useLocalStorage } from '../useStorage';
import { AuthApi } from './api';
export { AuthUrl } from './api';

type UserRole = 'admin' | 'trusted' | 'member' | 'restricted' | 'banned';

interface UserProfile {
  token: string;
  username: string;
  role: UserRole;
  createdAt: number;
  expiredAt: number;
  issuedAt: number;
}

interface UserData {
  profile?: UserProfile;
  adminMode: boolean;
}

function parseJwt(token: string): UserProfile {
  const { sub, exp, role, iat, crat } = jwtDecode<{
    sub: string;
    exp: number;
    iat: number;
    role: UserRole;
    crat: number;
  }>(token);
  return {
    token,
    username: sub,
    role,
    issuedAt: iat,
    createdAt: crat,
    expiredAt: exp,
  };
}

function useUserDataWithoutAuth(app: string) {
  const userData = ref<UserData>({
    profile: {
      token: '',
      username: 'user',
      role: 'admin',
      issuedAt: 0,
      createdAt: 0,
      expiredAt: 0,
    },
    adminMode: false,
  });
  async function refresh() {}
  async function logout() {
    return '';
  }

  return {
    userData,
    refresh,
    logout,
  };
}

function useUserDataWithAuth(app: string) {
  const userData = useLocalStorage<UserData>('auth', {
    profile: undefined,
    adminMode: false,
  });

  // 迁移旧数据
  if (userData.value.profile?.issuedAt === undefined) {
    userData.value.profile = undefined;
  }

  // 清空过期 Access Token
  if (
    userData.value.profile &&
    Date.now() > userData.value.profile.expiredAt * 1000
  ) {
    userData.value.profile = undefined;
  }

  const refresh = () =>
    AuthApi.refresh(app).then((token: string) => {
      userData.value.profile = parseJwt(token);
    });

  const refreshIfNeeded = () => {
    // 刷新 Access Token，冷却时间为1小时
    const cooldown = 60 * 60 * 1000;
    const sinceIssuedAt = Date.now() - (userData.value.profile?.issuedAt ?? 0);
    if (sinceIssuedAt < cooldown) {
      return;
    }
    return refresh().catch(async (e: unknown) => {
      let msg = `${e}`;
      if (e instanceof HTTPError) {
        msg = await e.response.text();
      }
      console.warn('更新授权失败：' + msg);
    });
  };

  // 每15分钟检查一次是否需要刷新
  refreshIfNeeded();
  window.setInterval(refreshIfNeeded, 15 * 60 * 1000);

  const logout = () => {
    userData.value.profile = undefined;
    return AuthApi.logout();
  };

  return {
    userData,
    refresh,
    logout,
  };
}

export function useUserData(app: string) {
  if (import.meta.env.VITE_NO_AUTH === 'true') {
    return useUserDataWithoutAuth(app);
  } else {
    return useUserDataWithAuth(app);
  }
}
