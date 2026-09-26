import { AuthUser } from '@novelia/auth-api';

import { authApi } from '@/api/auth/session';
import { LSKey } from './key';

export const useWhoamiStore = defineStore(LSKey.Auth, () => {
  const user = shallowRef<AuthUser>();
  if (authApi) {
    const unsubscribe = authApi.watchUser((value) => {
      user.value = value;
    });
    onScopeDispose(unsubscribe);
  } else {
    user.value = {
      id: 1,
      username: '本地用户',
      role: 'admin',
      createdAt: 0,
      adminMode: false,
    };
  }

  const whoami = computed(() => {
    const profile = user.value;
    const atLeastMember = AuthUser.hasRoleAtLeast(profile, 'member');
    const oldEnough = AuthUser.isAtLeastDaysOld(profile, 30);
    return {
      user: profile,
      isSignedIn: profile !== undefined,
      isAdmin: AuthUser.isAdmin(profile),
      asAdmin: AuthUser.asAdmin(profile),
      hasNsfwAccess: atLeastMember && oldEnough,
      hasForumAccess: atLeastMember,
      hasNovelAccess: atLeastMember && oldEnough,
      isMe: (username: string) => profile?.username === username,
    };
  });

  const toggleManageMode = () => {
    if (authApi) authApi.toggleAdminMode();
    else if (user.value)
      user.value = { ...user.value, adminMode: !user.value.adminMode };
  };

  return {
    whoami,
    toggleManageMode,
    logout: () => authApi?.logout() ?? Promise.resolve(''),
  };
});
