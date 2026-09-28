<script lang="ts" setup>
defineProps<{
  label?: string;
  icon?: Component;
  type?: 'default' | 'error';
  disabled?: boolean;
}>();

const emit = defineEmits<{ action: [MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="c-button-lite"
    :class="`c-button-lite--${type ?? 'default'}`"
    :disabled="disabled"
    @click.stop="emit('action', $event)"
  >
    <component :is="icon" v-if="icon" class="c-button-lite__icon" />
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<style scoped>
/* 用于长列表行内的文字按钮，替代 c-button（n-button），样式对齐 naive 的 tiny secondary 按钮。 */
.c-button-lite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex: none;
}

.c-button-lite:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 16%, transparent);
}

.c-button-lite:active:not(:disabled) {
  background: color-mix(in srgb, currentColor 24%, transparent);
}

.c-button-lite:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.c-button-lite__icon {
  width: 1em;
  height: 1em;
}

.c-button-lite--error {
  color: var(--ci-danger, #d03050);
}
</style>
