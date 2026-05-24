<script lang="ts" setup>
import type { ChapterMeta } from '@/domain/translator/TaskState';

defineProps<{ chapters: ChapterMeta[] }>();

const emit = defineEmits<{
  preview: [chapterId: string];
}>();

const themeVars = useThemeVars();

function pct(sp: { completed: number; total: number } | undefined): number {
  if (!sp || sp.total <= 0) return 0;
  return Math.round((sp.completed / sp.total) * 100);
}
</script>

<template>
  <div class="grid">
    <n-tooltip v-for="(ch, i) of chapters" :key="ch.chapterId" placement="top">
      <template #trigger>
        <n-button
          class="c"
          :focusable="false"
          :class="`c--${ch.status}`"
          :style="{ '--i': i }"
          quaternary
          @click="emit('preview', ch.chapterId)"
        >
          <span class="o">{{ ch.order }}</span>
          <span v-if="ch.segmentProgress" class="p">
            {{ ch.segmentProgress.completed }}/{{ ch.segmentProgress.total }}
          </span>

          <n-progress
            v-if="ch.segmentProgress && ch.status !== 'done'"
            type="line"
            :percentage="pct(ch.segmentProgress)"
            :height="3"
            :show-indicator="false"
            :fill-border-radius="0"
            class="bar"
          />
        </n-button>
      </template>
      {{ ch.title || `第 ${ch.order} 章` }}
    </n-tooltip>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  gap: 2px;
}
.c {
  aspect-ratio: 1;
  padding: 2px;
  border: 1px solid v-bind('themeVars.borderColor');
  color: v-bind('themeVars.textColor3');
  animation: in 0.3s ease both;
  animation-delay: calc(var(--i, 0) * 15ms);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.c :deep(.n-button__content) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  height: 100%;
}
@keyframes in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.c--translating {
  --pulse-from: color-mix(
    in srgb,
    v-bind('themeVars.infoColor') 0%,
    transparent
  );
  --pulse-to: color-mix(
    in srgb,
    v-bind('themeVars.infoColor') 15%,
    transparent
  );
  background: color-mix(
    in srgb,
    v-bind('themeVars.infoColor') 10%,
    transparent
  );
  color: v-bind('themeVars.infoColor');
  border-color: color-mix(
    in srgb,
    v-bind('themeVars.infoColor') 35%,
    transparent
  );
  animation:
    in 0.3s ease both,
    pulse 2s infinite;
  animation-delay: calc(var(--i, 0) * 15ms), calc(var(--i, 0) * 15ms + 0.5s);
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--pulse-from);
  }
  50% {
    box-shadow: 0 0 0 3px var(--pulse-to);
  }
}
.c--done {
  background: color-mix(
    in srgb,
    v-bind('themeVars.successColor') 10%,
    transparent
  );
  color: v-bind('themeVars.successColor');
  border-color: color-mix(
    in srgb,
    v-bind('themeVars.successColor') 35%,
    transparent
  );
}
.c--error {
  background: color-mix(
    in srgb,
    v-bind('themeVars.errorColor') 10%,
    transparent
  );
  color: v-bind('themeVars.errorColor');
  border-color: color-mix(
    in srgb,
    v-bind('themeVars.errorColor') 35%,
    transparent
  );
}
.o {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.p {
  position: relative;
  z-index: 1;
  font-size: 8px;
  line-height: 1;
  opacity: 0.75;
}
.bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}
</style>
