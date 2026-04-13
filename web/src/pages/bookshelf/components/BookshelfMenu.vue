<script lang="ts" setup>
import type { MenuOption } from 'naive-ui';

import { FavoredRepo, useWhoamiStore } from '@/stores';
import BookshelfMenuItem from './BookshelfMenuItem.vue';

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const favoredStore = FavoredRepo.useFavoredStore();
const { favoreds } = storeToRefs(favoredStore);

const menuOption = (
  type: 'web' | 'wenku' | 'local',
  id: string,
  title: string,
): MenuOption => ({
  label: () => h(BookshelfMenuItem, { id, title, type }),
  key: `${type}/${id}`,
});

const menuOptions = computed(() => {
  const localGroup = {
    type: 'group',
    label: '本地小说',
    key: 'group-local',
    children: favoreds.value.local.map(({ id, title }) =>
      menuOption('local', id, title),
    ),
  };
  if (whoami.value.isSignedIn) {
    const webGroup = {
      type: 'group',
      label: '网络小说',
      key: 'group-web',
      children: favoreds.value.web.map(({ id, title }) =>
        menuOption('web', id, title),
      ),
    };
    const wenkuGroup = {
      type: 'group',
      label: '文库小说',
      key: 'group-wenku',
      children: favoreds.value.wenku.map(({ id, title }) =>
        menuOption('wenku', id, title),
      ),
    };
    const divider = {
      type: 'divider',
      key: 'divider',
      props: { style: { marginLeft: '32px' } },
    };

    if (webGroup.children.length > 1) {
      webGroup.children.unshift(menuOption('web', 'all', '全部'));
    }
    if (wenkuGroup.children.length > 1) {
      wenkuGroup.children.unshift(menuOption('wenku', 'all', '全部'));
    }

    return [webGroup, divider, wenkuGroup, divider, localGroup];
  } else {
    return [localGroup];
  }
});
</script>

<template>
  <n-scrollbar>
    <n-menu v-bind="$attrs" :options="menuOptions" />
  </n-scrollbar>
</template>
