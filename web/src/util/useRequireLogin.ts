import { Toast } from '@novelia/web-kit';

import { useWhoamiStore } from '@/stores/useWhoamiStore';

/** Share the same login guard across buttons, menus and other action entry points. */
export const useRequireLogin = () => {
  const whoamiStore = useWhoamiStore();
  return <Args extends unknown[], Result>(action: (...args: Args) => Result) =>
    (...args: Args): Result | undefined => {
      if (!whoamiStore.whoami.isSignedIn) {
        Toast.info('请先登录');
        return;
      }
      return action(...args);
    };
};
