<script setup lang="ts">
import { useEventListener, usePreferredDark } from '@vueuse/core';

import { useSettingStore } from '@/stores';
import { authApi } from '@/api/auth/session';
import { formatError } from '@/api';

const props = defineProps<{ from?: string }>();
const router = useRouter();

const iframe = ref<HTMLIFrameElement>();
const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

useEventListener('message', async (event: MessageEvent<unknown>) => {
  const completion = authApi?.handleLoginMessage(
    event,
    iframe.value?.contentWindow,
  );
  if (!completion) return;
  try {
    await completion;
    await router.replace(props.from ?? '/');
  } catch (error) {
    message.error(await formatError(error));
  }
});

const prefersDark = usePreferredDark();
const iframeSrc = computed(() => {
  const theme =
    setting.value.theme === 'system'
      ? prefersDark.value
        ? 'dark'
        : 'light'
      : setting.value.theme;
  return authApi?.createLoginUrl(theme);
});
</script>

<template>
  <iframe
    ref="iframe"
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
