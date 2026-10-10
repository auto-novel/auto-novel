import { useLocalStorage } from '@vueuse/core';
import { LSKey } from './key';

export const useTabStore = defineStore('tab', () => {
  const lastTab = useLocalStorage<string>(LSKey.NovelBottomTab, 'comment');

  const setLastTab = (tab: string) => {
    if (tab !== 'glossary') {
      lastTab.value = tab;
    }
  };

  return {
    lastTab,
    setLastTab,
  };
});
