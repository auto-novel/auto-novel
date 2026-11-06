<script lang="ts" setup>
import { XPage, XPageHeader } from '@novelia/web-kit';

import { useIsWideScreen } from '@/pages/util';

defineProps<{ menuKey: string }>();

const isWideScreen = useIsWideScreen();
</script>

<template>
  <XPage>
    <XPageHeader title="我的收藏" />
    <slot />
    <template v-if="isWideScreen" #aside>
      <section-header title="收藏夹">
        <bookshelf-add-button />
      </section-header>
      <bookshelf-menu :value="menuKey" class="min-h-0" />
    </template>
  </XPage>
</template>
