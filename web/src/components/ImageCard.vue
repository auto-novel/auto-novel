<script lang="ts" setup>
import { externalImageUrls } from '@/config';

defineProps<{
  src: string;
  title: string;
}>();
</script>

<template>
  <div class="flex flex-col">
    <img
      :src="src ? src : externalImageUrls.wenkuCoverPlaceholder"
      alt="cover"
      class="aspect-[1/1.5] w-full rounded-[2px] object-cover"
      loading="lazy"
    />

    <div class="p-2">
      <div
        class="text-default line-clamp-2 h-[2.5em] leading-[1.25] wrap-anywhere"
      >
        <slot name="prefix" />
        {{ title }}
      </div>
    </div>
  </div>
</template>
