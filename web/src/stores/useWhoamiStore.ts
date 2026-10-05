import { AuthUser } from '@novelia/auth-api';

import { authApi } from '@/api/auth/session';
import { LSKey } from './key';

export const useWhoamiStore = defineStore(LSKey.Auth, () => {
  const user = shallowRef<AuthUser>();
  const unsubscribe = authApi.watchUser((value) => {
    user.value = value;
  });
  onScopeDispose(unsubscribe);

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

  const toggleManageMode = () => authApi.toggleAdminMode();

  return {
    whoami,
    toggleManageMode,
    logout: () => authApi.logout(),
  };
});
