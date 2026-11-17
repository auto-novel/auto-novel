<script lang="ts" setup>
withDefaults(
  defineProps<{
    title: string;
    align?: 'baseline' | 'center' | 'start';
    /** 顶部对齐时，默认按单选项的 20px 行高对齐；可覆盖以适配带内边距的控件。 */
    titleClass?: string;
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
      {
        'items-baseline': align === 'baseline',
        'items-center': align === 'center',
        'items-start': align === 'start',
      },
      size === 'medium' ? 'gap-x-4 gap-y-3' : 'gap-x-3 gap-y-2',
    ]"
  >
    <span
      class="shrink-0 text-muted text-[12px] whitespace-nowrap"
      :class="titleClass ?? (align === 'start' ? 'leading-5' : undefined)"
    >
      {{ title }}
    </span>
    <slot />
  </div>
</template>
