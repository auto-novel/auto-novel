<script lang="ts" setup>
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
  <div class="mx-0 mt-0 mb-4.5">
    <h3 class="heading-bar mx-0 mt-0 mb-1">
      <ULink :href="WebUtil.buildNovelUrl(providerId, novelId)">
        {{ displayTitle }}
      </ULink>
    </h3>
    <span class="block text-[14px] leading-[1.6] text-muted" v-if="titleZh">
      {{ titleJp }}
    </span>
  </div>
</template>
