<script setup lang="ts">
import { computed } from 'vue';
import { formatFileSize } from './bannerImage';

const quality = defineModel<number>({ required: true });
const props = defineProps<{
  originalSize: number;
  compressed?: File;
  disabled?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ compress: []; revert: [] }>();

const options = [
  { value: 0.95, label: '高质量' },
  { value: 0.85, label: '标准' },
  { value: 0.75, label: '更小' },
  { value: 0.65, label: '默认' },
] as const;

const savedPercent = computed(() => {
  if (!props.compressed || props.originalSize <= 0) return 0;
  return Math.max(
    0,
    Math.round((1 - props.compressed.size / props.originalSize) * 100),
  );
});
</script>

<template>
  <section class="webp-panel" :aria-busy="busy">
    <strong class="webp-title">WebP 压缩</strong>

    <div class="webp-actions">
      <label class="quality-field">
        <span>质量</span>
        <select
          v-model.number="quality"
          :disabled="disabled || busy"
          aria-label="WebP 质量"
        >
          <option
            v-for="option in options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.value }} · {{ option.label }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="btn btn-small"
        :disabled="disabled || busy"
        @click="emit('compress')"
      >
        {{ busy ? '正在压缩…' : compressed ? '重新压缩' : '压缩为 WebP' }}
      </button>
      <button
        v-if="compressed"
        type="button"
        class="text-button"
        :disabled="disabled || busy"
        @click="emit('revert')"
      >
        使用原图
      </button>
    </div>

    <div class="webp-summary">
      <template v-if="compressed">
        <span>原图 {{ formatFileSize(originalSize) }}</span>
        <span class="webp-arrow" aria-hidden="true">→</span>
        <strong>{{ formatFileSize(compressed.size) }}</strong>
        <span class="webp-saving">-{{ savedPercent }}%</span>
      </template>
      <span v-else>原图 {{ formatFileSize(originalSize) }}</span>
    </div>
  </section>
</template>

<style scoped>
.webp-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 12px 0 20px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-muted);
}
.webp-title {
  font-size: 13px;
}
.quality-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-muted);
  font-size: 12px;
}
.quality-field select {
  min-width: 132px;
  box-sizing: border-box;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--ui-text);
  font-size: 13px;
}
.quality-field select:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 1px;
}
.quality-field select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.webp-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.webp-summary strong {
  color: var(--ui-primary);
}
.webp-arrow {
  color: var(--ui-text-muted);
}
.webp-saving {
  padding: 1px 6px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
  color: var(--ui-primary);
  font-size: 11px;
}
.webp-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.webp-actions .btn {
  box-sizing: border-box;
  height: 32px;
  padding-block: 0;
}
</style>
