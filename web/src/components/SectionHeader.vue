<script lang="ts" setup>
defineProps<{ title: string }>();
</script>

<template>
  <div
    class="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
  >
    <h2 class="heading-bar" style="flex-shrink: 0">{{ title }}</h2>
    <div class="flex shrink-0 flex-wrap justify-start gap-x-3 gap-y-2">
      <slot />
    </div>
  </div>
</template>
