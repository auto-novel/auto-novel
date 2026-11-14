<script lang="ts" setup>
withDefaults(
  defineProps<{
    title: string;
    align?: 'baseline' | 'center';
    size?: 'small' | 'medium';
  }>(),
  {
    align: 'baseline',
    size: 'small',
  },
);
</script>

<template>
  <div
    class="flex"
    :class="[
      align === 'center' ? 'items-center' : 'items-baseline',
      size === 'medium' ? 'gap-x-4 gap-y-3' : 'gap-x-3 gap-y-2',
    ]"
  >
    <span class="text-muted text-[12px] whitespace-nowrap">
      {{ title }}
    </span>
    <slot />
  </div>
</template>
