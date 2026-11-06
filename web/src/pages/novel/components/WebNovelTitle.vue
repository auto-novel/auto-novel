<script lang="ts" setup>
import { NText } from 'naive-ui';

import { WebUtil } from '@/util/web';

const props = defineProps<{
  providerId: string;
  novelId: string;
  titleJp: string;
  titleZh?: string;
}>();

const displayTitle = computed(() => props.titleZh ?? props.titleJp);
</script>

<template>
  <div style="margin: 0 0 18px">
    <n-h3 prefix="bar" style="margin: 0 0 4px">
      <n-a :href="WebUtil.buildNovelUrl(providerId, novelId)">
        {{ displayTitle }}
      </n-a>
    </n-h3>
    <n-text
      v-if="titleZh"
      depth="3"
      style="display: block; font-size: 14px; line-height: 1.6"
    >
      {{ titleJp }}
    </n-text>
  </div>
</template>
