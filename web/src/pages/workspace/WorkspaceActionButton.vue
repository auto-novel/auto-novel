<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui';
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    label: string;
    icon: Component;
    tooltip?: string;
    iconOnly?: boolean;
    color?: ButtonProps['color'];
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
  <UTooltip v-if="tooltip">
    <span class="inline-flex shrink-0">
      <ActionButton
        :color="color"
        variant="soft"
        class="shrink-0 whitespace-nowrap"
        :class="iconOnly ? 'size-5.5 justify-center p-0' : 'px-2.5'"
        size="xs"
        :square="iconOnly"
        :aria-label="label"
        :disabled="disabled"
        :action="() => onAction?.()"
        :icon="icon"
        :ui="{ leadingIcon: 'size-3.5' }"
      >
        <template v-if="!iconOnly">{{ label }}</template>
      </ActionButton>
    </span>
    <template #content>{{ tooltip }}</template>
  </UTooltip>
  <ActionButton
    v-else
    :color="color"
    variant="soft"
    class="shrink-0 whitespace-nowrap"
    :class="iconOnly ? 'size-5.5 justify-center p-0' : 'px-2.5'"
    size="xs"
    :square="iconOnly"
    :aria-label="label"
    :disabled="disabled"
    :action="() => onAction?.()"
    :icon="icon"
    :ui="{ leadingIcon: 'size-3.5' }"
  >
    <template v-if="!iconOnly">{{ label }}</template>
  </ActionButton>
</template>
