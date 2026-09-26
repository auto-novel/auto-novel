<script lang="ts" setup>
defineProps<{
  tooltip?: string;
  icon: Component;
  type?: 'default' | 'error' | 'warning';
  disabled?: boolean;
}>();

const emit = defineEmits<{ action: [MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="ci-icon-button"
    :class="`ci-icon-button--${type ?? 'default'}`"
    :aria-label="tooltip"
    :disabled="disabled"
    @click.stop="emit('action', $event)"
  >
    <component :is="icon" class="ci-icon-button__icon" />
    <span v-if="tooltip" class="ci-icon-button__tip">{{ tooltip }}</span>
  </button>
</template>

<style scoped>
/* 用于长列表行内的图标按钮。裸元素实现，替代 c-icon-button（n-button + n-tooltip），
   单实例内存开销约为后者的 1/100，样式对齐 naive 的 tiny circle secondary 按钮。 */
.ci-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  flex: none;
}

.ci-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 16%, transparent);
}

.ci-icon-button:active:not(:disabled) {
  background: color-mix(in srgb, currentColor 24%, transparent);
}

.ci-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ci-icon-button__icon {
  width: 1em;
  height: 1em;
}

.ci-icon-button--error {
  color: var(--ci-danger, #d03050);
}

.ci-icon-button--warning {
  color: var(--ci-warning, #f0a020);
}

.ci-icon-button__tip {
  display: none;
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 10;
  padding: 4px 8px;
  border-radius: 4px;
  background: #48484e;
  color: #fff;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
}

.ci-icon-button:hover .ci-icon-button__tip,
.ci-icon-button:focus-visible .ci-icon-button__tip {
  display: block;
}
</style>
