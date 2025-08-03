<script lang="ts" setup>
import { darkTheme, dateZhCN, useOsTheme, zhCN } from 'naive-ui';

import { Locator } from '@/data';
import { RegexUtil } from '@/util';

// 激活权限
const authRepository = Locator.authRepository();
authRepository.startRefreshAuth();

const settingRepository = Locator.settingRepository();
settingRepository.activateCC();

// 清理pinia留下的垃圾
Object.keys(window.localStorage).forEach((key) => {
  if (key.startsWith('pubkey')) {
    window.localStorage.removeItem(key);
  }
});

// 主题
const route = useRoute();
const osThemeRef = useOsTheme();

const setting = settingRepository.setting;
const { setting: readerSetting } = Locator.readerSettingRepository();

const isDarkColor = (color: string) => {
  const r = parseInt(color.substring(1, 3), 16);
  const g = parseInt(color.substring(3, 5), 16);
  const b = parseInt(color.substring(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 120;
};

const buildTheme = (
  theme: 'light' | 'dark' | 'system' | 'custom',
  bodyColor?: string,
): {
  isDark: boolean;
  bodyColor?: string;
} => {
  switch (theme) {
    case 'light':
      return { isDark: false };
    case 'dark':
      return { isDark: true };
    case 'system':
      return { isDark: osThemeRef.value === 'dark' };
    case 'custom':
      return { isDark: isDarkColor(bodyColor!), bodyColor };
  }
};
const theme = computed(() => {
  if (route.meta.isReader) {
    const theme = readerSetting.value.theme;
    return buildTheme(theme.mode, theme.bodyColor);
  } else {
    return buildTheme(setting.value.theme, undefined);
  }
});

// 处理Safari的奇妙问题
if (RegexUtil.isSafari(navigator.userAgent)) {
  // 防止Safari返回上一页时的灰屏
  // https://github.com/reactjs/react.dev/blob/e45ac5552c13fc50832624b7deb0c6f631d461bf/src/pages/_app.tsx#L30
  window.history.scrollRestoration = 'auto';

  // 禁用浏览器聚焦时的自动缩放，但浏览器还是会允许用户手动缩放
  const meta = document.querySelector('meta[name="viewport"]')!;
  const content = meta.getAttribute('content')!;
  meta.setAttribute('content', `${content}, user-scalable=no`);
}
</script>

<template>
  <n-config-provider
    :theme="theme.isDark ? darkTheme : null"
    :locale="zhCN"
    :date-locale="dateZhCN"
    inline-theme-disabled
    :theme-overrides="{
      Drawer: { bodyPadding: '0px' },
      List: { color: '#0000' },
      common: {
        ...(theme.bodyColor === undefined
          ? undefined
          : { bodyColor: theme.bodyColor }),
      },
    }"
  >
    <n-global-style />
    <n-message-provider container-style="white-space: pre-wrap">
      <n-loading-bar-provider>
        <router-view v-slot="{ Component }">
          <keep-alive :include="['MainLayout']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </n-loading-bar-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
a {
  text-decoration: none;
}
p,
li {
  overflow-wrap: break-word;
  word-break: break-word;
}
.n-h:first-child {
  margin: var(--n-margin);
}
.text-2line {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.float {
  position: fixed;
  right: 40px;
  bottom: 20px;
  box-shadow: rgb(0 0 0 / 40%) 2px 2px 8px 0px;
}
.n-drawer-header__main {
  flex: 1;
}
.sortable-ghost {
  opacity: 0.7;
}

@supports (-webkit-touch-callout: none) {
  /* 仅在支持 -webkit-touch-callout 的设备上生效（iOS 特有） */

  .v-vl:not(.v-vl--show-scrollbar),
  .n-scrollbar > .n-scrollbar-container {
    scrollbar-width: unset;
  }

  .v-vl:not(.v-vl--show-scrollbar)::-webkit-scrollbar,
  .v-vl:not(.v-vl--show-scrollbar)::-webkit-scrollbar-track-piece,
  .v-vl:not(.v-vl--show-scrollbar)::-webkit-scrollbar-thumb,
  .n-scrollbar > .n-scrollbar-container::-webkit-scrollbar,
  .n-scrollbar > .n-scrollbar-container::-webkit-scrollbar-track-piece,
  .n-scrollbar > .n-scrollbar-container::-webkit-scrollbar-thumb {
    width: unset;
    height: unset;
    display: unset;
  }
}
</style>
