<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

import { useSettingStore, useWhoamiStore } from '@/stores';
import { AuthUrl } from '@/util';

const props = defineProps<{ from?: string }>();
const router = useRouter();

const whoamiStore = useWhoamiStore();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

useEventListener('message', async (event: MessageEvent) => {
  if (event.origin === AuthUrl && event.data.type === 'login_success') {
    await whoamiStore.refresh().then(() => {
      const from = props.from ?? '/';
      router.replace(from);
    });
  }
});

const iframeSrc = computed(() => {
  const theme = setting.value.theme;
  const url = new URL(AuthUrl);
  url.searchParams.set('app', 'n');
  url.searchParams.set('theme', theme);

  if (import.meta.env.VITE_API_MODE === 'remote') {
    // vite.config.ts 中配置了 /auth-proxy 代理到 AuthUrl 了
    url.pathname = '/auth-proxy';
  }

  return url.toString();
});
</script>

<template>
  <iframe
    :src="iframeSrc"
    frameborder="0"
    allowfullscreen
    style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      border: none;
      z-index: 9999;
    "
  ></iframe>
</template>
