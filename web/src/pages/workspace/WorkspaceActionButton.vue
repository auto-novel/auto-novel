<script setup lang="ts">
import { XButton, XTooltip } from '@novelia/web-kit';
import type { XButtonColor } from '@novelia/web-kit';
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    label: string;
    icon: Component;
    tooltip?: string;
    iconOnly?: boolean;
    color?: XButtonColor;
    disabled?: boolean;
    onAction?: () => unknown;
  }>(),
  {
    color: 'neutral',
    tooltip: undefined,
    onAction: undefined,
  },
);
</script>

<template>
  <XTooltip v-if="tooltip">
    <template #trigger>
      <span class="inline-flex shrink-0">
        <XButton
          :color="color"
          variant="soft"
          class="group shrink-0 whitespace-nowrap rounded-full"
          :class="iconOnly ? 'size-5.5 p-0 text-xs' : 'px-2.5'"
          :size="iconOnly ? 'icon-xs' : 'tiny'"
          :aria-label="label"
          :disabled="disabled"
          loading-auto
          @click="onAction?.()"
        >
          <component
            :is="icon"
            class="size-3.5 shrink-0 group-aria-busy:hidden"
            aria-hidden="true"
          />
          <template v-if="!iconOnly">{{ label }}</template>
        </XButton>
      </span>
    </template>
    {{ tooltip }}
  </XTooltip>
  <XButton
    v-else
    :color="color"
    variant="soft"
    class="group shrink-0 whitespace-nowrap rounded-full"
    :class="iconOnly ? 'size-5.5 p-0 text-xs' : 'px-2.5'"
    :size="iconOnly ? 'icon-xs' : 'tiny'"
    :aria-label="label"
    :disabled="disabled"
    loading-auto
    @click="onAction?.()"
  >
    <component
      :is="icon"
      class="size-3.5 shrink-0 group-aria-busy:hidden"
      aria-hidden="true"
    />
    <template v-if="!iconOnly">{{ label }}</template>
  </XButton>
</template>
