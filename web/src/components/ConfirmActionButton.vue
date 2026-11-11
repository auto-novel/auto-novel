<script setup lang="ts">
import { Toast, XConfirmDialog } from '@novelia/web-kit';
import type { Component } from 'vue';

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  hint: string;
  label?: string;
  icon?: Component;
  action: (event: MouseEvent) => unknown;
  loading?: boolean;
  disabled?: boolean;
}>();

const attrs = useAttrs();
const open = ref(false);
const running = ref(false);
const triggerEvent = shallowRef<MouseEvent>();

const openConfirmation = (event: MouseEvent) => {
  if (running.value || props.loading || props.disabled) return;
  triggerEvent.value = event;
  open.value = true;
};
const updateOpen = (value: boolean) => {
  if (!running.value && !props.loading) open.value = value;
};
const confirm = async () => {
  if (running.value || props.loading || props.disabled || !triggerEvent.value)
    return;
  running.value = true;
  try {
    const result = await props.action(triggerEvent.value);
    // A false result explicitly keeps the confirmation open for retry.
    if (result !== false) open.value = false;
  } catch (error) {
    Toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    running.value = false;
  }
};
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    class="group rounded-full"
    v-bind="$attrs"
    :label="label"
    :loading="running || loading"
    :aria-busy="running || loading"
    :disabled="disabled"
    @click="openConfirmation"
  >
    <template v-if="icon" #default>
      <component
        :is="icon"
        class="shrink-0 group-aria-busy:hidden"
        :class="attrs.size === 'xs' ? 'size-3.5' : 'size-4.5'"
        aria-hidden="true"
      />
      <span v-if="label">{{ label }}</span>
    </template>
  </UButton>
  <XConfirmDialog
    :open="open"
    :title="label ? `确认${label}` : '确认操作'"
    :description="hint"
    confirm-label="确定"
    :danger="attrs.color === 'error'"
    :loading="running || loading"
    @update:open="updateOpen"
    @confirm="confirm"
  />
</template>
