<script setup lang="ts">
import { XSkeleton } from '@novelia/web-kit';

withDefaults(defineProps<{ panel?: boolean }>(), { panel: false });
</script>

<template>
  <div role="status" aria-label="正在加载文库小说" class="@container">
    <span class="sr-only">正在加载文库小说…</span>
    <div
      aria-hidden="true"
      class="grid gap-3"
      :class="
        panel
          ? 'grid-cols-3 @min-[600px]:grid-cols-6'
          : 'grid-cols-2 @min-[500px]:grid-cols-3 @min-[800px]:grid-cols-4'
      "
    >
      <div v-for="index in panel ? 12 : 8" :key="index" class="min-w-0">
        <XSkeleton class="aspect-[2/3] w-full" />
        <div class="space-y-1.5 p-2">
          <XSkeleton class="h-3.5 w-full bg-border" />
          <XSkeleton class="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
  </div>
</template>
