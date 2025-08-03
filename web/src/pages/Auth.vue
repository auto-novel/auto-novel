<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

import { Locator } from '@/data';

const props = defineProps<{ from?: string }>();
const router = useRouter();
const authRepo = Locator.authRepository();

useEventListener('message', async (event: MessageEvent) => {
  if (
    event.origin === 'https://auth.novelia.cc' &&
    event.data.type === 'login_success'
  ) {
    await authRepo.refresh().then(() => {
      const from = props.from ?? '/';
      router.replace(from);
    });
  }
});
</script>

<template>
  <iframe
    src="https://auth.novelia.cc?app=n"
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
