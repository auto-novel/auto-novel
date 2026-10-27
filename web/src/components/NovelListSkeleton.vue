<script setup lang="ts">
import { XSkeleton } from '@novelia/web-kit';

withDefaults(
  defineProps<{
    panel?: boolean;
    simple?: boolean;
  }>(),
  { panel: false, simple: false },
);
</script>

<template>
  <div role="status" aria-label="正在加载小说列表" class="@container">
    <span class="sr-only">正在加载小说列表…</span>
    <div
      aria-hidden="true"
      :class="
        panel
          ? 'grid grid-cols-1 gap-3 @min-[850px]:grid-cols-4'
          : 'divide-y divide-divider'
      "
    >
      <div
        v-for="index in panel ? 8 : 6"
        :key="index"
        :class="panel ? 'min-w-0 space-y-2 p-2' : 'space-y-2 py-3'"
      >
        <XSkeleton class="h-5 w-4/5 bg-border" />
        <XSkeleton class="h-5 w-3/5" />
        <XSkeleton v-if="!panel && !simple" class="h-4 w-1/3" />
        <XSkeleton v-if="!panel && !simple" class="h-4 w-2/3" />
        <XSkeleton class="h-4 w-3/4" />
        <XSkeleton class="h-4 w-1/2" />
      </div>
    </div>
  </div>
</template>
