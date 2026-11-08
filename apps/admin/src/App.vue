<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { PanoramaOutlined } from '@vicons/material';
import {
  AdminSiteSwitcher,
  WebKitApp,
  WebKitLayout,
  XPage,
  useWebKit,
  type WebKitMenuOption,
} from '@novelia/web-kit';

const route = useRoute();
const { whoami, checkSignedIn } = useWebKit();
const checking = ref(true);
const menu: WebKitMenuOption[] = [
  {
    key: 'banners',
    label: 'Banner 管理',
    to: { name: 'banners' },
    icon: PanoramaOutlined,
  },
];

async function checkSession() {
  checking.value = true;
  try {
    await checkSignedIn();
  } finally {
    checking.value = false;
  }
}
onMounted(checkSession);
</script>

<template>
  <WebKitApp>
    <WebKitLayout
      :navigation-options="menu"
      :account-options="[]"
      :selected-navigation-key="String(route.name ?? '')"
    >
      <template #header-actions>
        <AdminSiteSwitcher current="auto-novel" />
      </template>
      <RouterView v-if="!checking && whoami.isAdmin" />
      <XPage v-else>
        <div v-if="checking" class="empty-state" role="status">
          正在检查登录状态…
        </div>
        <div v-else class="empty-state">
          <h1>
            {{ whoami.isSignedIn ? '需要管理员权限' : '欢迎使用小说管理后台' }}
          </h1>
          <p>
            {{
              whoami.isSignedIn
                ? '当前账号没有访问管理后台的权限，请切换管理员账号。'
                : '请先通过右上角登录账号，再访问管理后台。'
            }}
          </p>
          <a class="btn" href="/">返回小说站点</a>
        </div>
      </XPage>
    </WebKitLayout>
  </WebKitApp>
</template>
