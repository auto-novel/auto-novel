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
  if (
    event.origin === new URL(AuthUrl).origin &&
    event.data.type === 'login_success'
  ) {
    await whoamiStore.refresh().then(() => {
      const from = props.from ?? '/';
      router.replace(from);
    });
  }
});

const iframeSrc = computed(() => {
  const url = new URL(AuthUrl);
  url.searchParams.set('app', 'n');
  url.searchParams.set('theme', setting.value.theme);
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
