<script lang="ts" setup>
import { externalImageUrls } from '@/config';

defineProps<{
  src: string;
  title: string;
}>();
</script>

<template>
  <div class="flex flex-col flex-nowrap justify-start gap-0">
    <img
      :src="src ? src : externalImageUrls.wenkuCoverPlaceholder"
      alt="cover"
      style="
        width: 100%;
        aspect-ratio: 1 / 1.5;
        object-fit: cover;
        border-radius: 2px;
      "
      loading="lazy"
    />

    <div style="padding: 8px">
      <n-text
        tag="div"
        style="height: 2.5em; line-height: 1.25; overflow-wrap: anywhere"
        class="text-2line"
      >
        <slot name="prefix" />
        {{ title }}
      </n-text>
    </div>
  </div>
</template>
