<script setup lang="ts">
import { formatFileSize, type BannerImage } from './bannerImage';
defineProps<{ image: BannerImage }>();
</script>

<template>
  <p class="image-meta">
    {{ formatFileSize(image.file.size) }} · 原始 {{ image.width }} ×
    {{ image.height }} px
  </p>
</template>

<style scoped>
.image-meta {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
</style>
