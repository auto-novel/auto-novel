import { setTokenGetter } from '@/api/novel/client';
import { useUserData } from '@/util';
import { LSKey } from './key';
import { UserRole } from '@/model/User';
import { at } from 'lodash-es';

export const useWhoamiStore = defineStore(LSKey.Auth, () => {
  const { userData, refresh, logout } = useUserData('n');
  setTokenGetter(() => userData.value?.profile?.token ?? '');

  const whoami = computed(() => {
    const { profile, adminMode } = userData.value;

    const isSignedIn = profile !== undefined;
    const isAdmin = profile?.role === 'admin';
    const asAdmin = isAdmin && adminMode;

    const createAtLeast = (days: number) => {
      if (!profile) return false;
      return Date.now() / 1000 - profile.createdAt > days * 24 * 3600;
    };

    const buildRoleLabel = () => {
      if (!profile) return '';
      return UserRole.toString(profile.role) + (adminMode ? '+' : '');
    };

    const atLeastMember =
      profile !== undefined && ['admin', 'member'].includes(profile.role);
    const hasNsfwAccess = atLeastMember && createAtLeast(30);
    const hasForumAccess = atLeastMember;
    const hasNovelAccess = atLeastMember && createAtLeast(30);

    return {
      user: {
        username: profile?.username ?? '未登录',
        role: buildRoleLabel(),
        createAt: profile?.createdAt ?? Date.now() / 1000,
      },
      isSignedIn,
      isAdmin,
      asAdmin,
      hasNsfwAccess,
      hasForumAccess,
      hasNovelAccess,
      isMe: (username: string) => profile?.username === username,
    };
  });

  const toggleManageMode = () => {
    userData.value.adminMode = !userData.value.adminMode;
  };

  return {
    whoami,
    toggleManageMode,
    refresh,
    logout,
  };
});
