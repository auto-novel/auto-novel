<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  before: string;
  after: string;
  alt: string;
  aspect?: number;
}>();
const position = ref(50);
const measuredAspect = ref<number>();
const ratio = computed(() => props.aspect ?? measuredAspect.value ?? 16 / 9);

function measure(event: Event) {
  if (props.aspect) return;
  const image = event.target as HTMLImageElement;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    measuredAspect.value = image.naturalWidth / image.naturalHeight;
  }
}
</script>

<template>
  <div class="compare" :style="{ '--compare-ratio': ratio }">
    <img
      class="compare-image"
      :src="before"
      :alt="`${alt}（压缩前）`"
      @load="measure"
    />
    <div
      class="compare-after"
      :style="{ clipPath: `inset(0 0 0 ${position}%)` }"
    >
      <img class="compare-image" :src="after" :alt="`${alt}（压缩后）`" />
    </div>
    <span class="compare-label before">压缩前</span>
    <span class="compare-label after">压缩后</span>
    <span
      class="compare-divider"
      :style="{ left: `${position}%` }"
      aria-hidden="true"
    >
      <span class="compare-handle">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M9 6 4 12l5 6M15 6l5 6-5 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </span>
    <input
      v-model.number="position"
      class="compare-range"
      type="range"
      min="0"
      max="100"
      step="0.1"
      aria-label="拖动对比压缩前后"
    />
  </div>
</template>

<style scoped>
.compare {
  position: relative;
  width: min(100%, calc(520px * var(--compare-ratio)));
  aspect-ratio: var(--compare-ratio);
  overflow: hidden;
  border-radius: 8px;
  line-height: 0;
  user-select: none;
  touch-action: none;
}
.compare-image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.compare-after {
  position: absolute;
  inset: 0;
}
.compare-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 15%);
  transform: translateX(-50%);
  pointer-events: none;
}
.compare-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: #1f2225;
  box-shadow: 0 2px 8px rgb(0 0 0 / 25%);
  transform: translate(-50%, -50%);
}
.compare-label {
  position: absolute;
  top: 10px;
  padding: 3px 8px;
  border-radius: 20px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  pointer-events: none;
}
.compare-label.before {
  left: 10px;
}
.compare-label.after {
  right: 10px;
}
.compare-range {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: ew-resize;
}
.compare:has(.compare-range:focus-visible) {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
