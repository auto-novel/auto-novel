<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bannerFocalPosition } from './bannerFocal';
import ImageCompare from './ImageCompare.vue';

const props = defineProps<{
  src: string;
  alt: string;
  editable?: boolean;
  disabled?: boolean;
  compareBefore?: string;
  compareAfter?: string;
  compareAspect?: number;
}>();

const focalX = defineModel<number>('focalX', { required: true });
const focalY = defineModel<number>('focalY', { required: true });

type PreviewMode = 'original' | 'compare' | 'desktop' | 'mobile';

interface PreviewOption {
  value: PreviewMode;
  label: string;
  width: number;
  height: number;
  books: number;
}

// 尺寸对齐首页 banner 的实际裁剪区域（见 web/src/pages/home/Home.vue）：
// 桌面 1440 视口、侧栏展开 240px，内容区 1200px，高度 42×1.6 + 20 + 40 + 20 + 50 ≈ 197px；
// 移动 390 视口，高度 42×1.6 + 20 + 40 + 10 + 35 ≈ 172px。
const modes = computed<PreviewOption[]>(() => {
  const list: PreviewOption[] = [
    { value: 'original', label: '原图', width: 0, height: 0, books: 0 },
  ];
  if (props.compareBefore && props.compareAfter) {
    list.push({
      value: 'compare',
      label: '压缩对比',
      width: 0,
      height: 0,
      books: 0,
    });
  }
  list.push(
    { value: 'desktop', label: '桌面模拟', width: 1200, height: 197, books: 6 },
    { value: 'mobile', label: '移动模拟', width: 390, height: 172, books: 3 },
  );
  return list;
});
const mode = ref<PreviewMode>('original');
const isSimulation = computed(
  () => mode.value === 'desktop' || mode.value === 'mobile',
);
const imageSize = ref({ width: 0, height: 0 });
watch(
  () => props.src,
  () => {
    imageSize.value = { width: 0, height: 0 };
  },
);
function imageLoaded(event: Event) {
  const image = event.target as HTMLImageElement;
  imageSize.value = { width: image.naturalWidth, height: image.naturalHeight };
}
const currentMode = computed(
  () =>
    modes.value.find((item) => item.value === mode.value) ?? modes.value[0]!,
);
const focalPosition = computed(() =>
  bannerFocalPosition(
    imageSize.value.width,
    imageSize.value.height,
    currentMode.value.width,
    currentMode.value.height,
    focalX.value,
    focalY.value,
  ),
);
const canCompare = computed(
  () => !!props.compareBefore && !!props.compareAfter,
);
watch(canCompare, (available) => {
  if (!available && mode.value === 'compare') mode.value = 'original';
});
</script>

<template>
  <div class="banner-preview">
    <div class="preview-toolbar">
      <div class="filter-tabs" aria-label="预览方式">
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          :class="{ selected: mode === option.value }"
          :aria-pressed="mode === option.value"
          @click="mode = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <span
        v-if="mode === 'desktop' || mode === 'mobile'"
        class="preview-caption"
      >
        模拟裁剪 · {{ currentMode.width }} × {{ currentMode.height }} px
      </span>
      <div v-if="$slots.actions" class="preview-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="preview-layout">
      <div
        v-if="editable && isSimulation"
        class="focal-sliders"
        role="group"
        aria-label="焦点微调"
      >
        <div class="focal-slider-row">
          <span class="focal-axis" aria-hidden="true">X</span>
          <USlider
            class="focal-slider"
            v-model="focalX"
            aria-label="X"
            :min="0"
            :max="1"
            :step="0.001"
            :disabled="disabled"
          />
          <output class="focal-value" aria-hidden="true">
            {{ (focalX * 100).toFixed(1) }}%
          </output>
        </div>
        <div class="focal-slider-row">
          <span class="focal-axis" aria-hidden="true">Y</span>
          <USlider
            class="focal-slider"
            v-model="focalY"
            aria-label="Y"
            :min="0"
            :max="1"
            :step="0.001"
            :disabled="disabled"
          />
          <output class="focal-value" aria-hidden="true">
            {{ (focalY * 100).toFixed(1) }}%
          </output>
        </div>
      </div>
      <div class="preview-stage" :class="{ 'mobile-stage': mode === 'mobile' }">
        <img
          v-if="mode === 'original'"
          class="original-image"
          :src="src"
          :alt="alt"
        />
        <ImageCompare
          v-else-if="mode === 'compare' && compareBefore && compareAfter"
          :before="compareBefore"
          :after="compareAfter"
          :alt="alt"
          :aspect="compareAspect"
        />
        <div
          v-else
          class="device-preview"
          :class="mode"
          :style="{
            '--banner-ratio': `${currentMode.width} / ${currentMode.height}`,
            '--device-width': `${currentMode.width}px`,
            '--book-columns': currentMode.books,
          }"
        >
          <div
            v-if="mode === 'desktop'"
            class="browser-chrome"
            aria-hidden="true"
          >
            <div class="window-dots">
              <i v-for="index in 3" :key="index"></i>
            </div>
            <span class="browser-address">novelia · 首页</span>
            <span class="browser-menu">···</span>
          </div>
          <div v-else class="phone-status" aria-hidden="true">
            <span>9:41</span>
            <span class="phone-island"></span>
            <span>▮▮▮ ▰</span>
          </div>
          <div class="mock-page">
            <div class="mock-nav" aria-hidden="true">
              <strong>轻小说机翻机器人</strong>
              <div v-if="mode === 'desktop'" class="mock-nav-links">
                <span v-for="label in ['首页', '小说', '论坛']" :key="label">
                  {{ label }}
                </span>
              </div>
              <span class="mock-account">
                {{ mode === 'desktop' ? '登录 / 注册' : '☰' }}
              </span>
            </div>
            <div class="mock-banner">
              <img
                :src="src"
                :alt="alt"
                :style="{ objectPosition: focalPosition }"
                @load="imageLoaded"
              />
              <div class="mock-banner-content" aria-hidden="true">
                <strong>轻小说机翻机器人</strong>
                <div class="mock-search">
                  <span>搜索小说或输入链接…</span>
                  <span>搜索</span>
                </div>
              </div>
            </div>
            <div class="mock-content" aria-hidden="true">
              <div class="mock-content-heading">
                <strong>最近更新</strong>
                <span>查看全部 →</span>
              </div>
              <div class="mock-books">
                <div
                  v-for="index in currentMode.books"
                  :key="index"
                  class="mock-book"
                >
                  <div class="mock-cover"></div>
                  <div class="mock-line"></div>
                  <div class="mock-line short"></div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="mode === 'mobile'" class="phone-bottom" aria-hidden="true">
            <span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./banner.shared.css"></style>

<style scoped>
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
}
.preview-actions {
  margin-left: auto;
}
.preview-toolbar .filter-tabs {
  padding: 3px;
  border-radius: 8px;
  background: var(--color-neutral-soft);
}
.preview-toolbar .filter-tabs button {
  border-radius: 6px;
  transition:
    background 150ms ease,
    color 150ms ease;
}
.preview-toolbar .filter-tabs button.selected {
  background: var(--color-surface);
}
.preview-layout {
  position: relative;
  display: flex;
  margin: 0 20px;
}
.focal-sliders {
  position: absolute;
  z-index: 2;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  width: min(260px, calc(100% - 24px));
  padding: 6px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 78%, transparent);
  border: 1px solid var(--color-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 2px 10px rgb(0 0 0 / 8%);
}
.focal-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-ink);
  font-size: 12px;
}
.focal-axis {
  flex-shrink: 0;
}
.focal-value {
  flex: 0 0 6ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.focal-slider {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}
.preview-stage {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 560px;
  overflow: hidden;
  padding: 20px;
  border-radius: 10px;
  background: var(--color-neutral-soft);
}
.mobile-stage {
  height: auto;
  min-height: 560px;
}
.original-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.device-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 12px 32px rgb(0 0 0 / 8%);
  container-type: inline-size;
}
.mock-page {
  min-height: 0;
  overflow: auto;
}
.browser-chrome,
.phone-status,
.phone-bottom {
  flex-shrink: 0;
}
.browser-chrome {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-hover);
  font-size: 11px;
  color: var(--color-muted);
}
.window-dots {
  display: flex;
  gap: 5px;
}
.window-dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-muted);
  opacity: 0.45;
}
.browser-address {
  flex: 1;
  padding: 4px 12px;
  border-radius: 5px;
  background: var(--color-surface);
  text-align: center;
}
.mock-nav {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 5%;
  font-size: clamp(9px, 1.3cqw, 14px);
}
.mock-nav-links {
  display: flex;
  gap: 20px;
  color: var(--color-muted);
}
.mock-account {
  margin-left: auto;
  color: var(--color-muted);
  white-space: nowrap;
}
.mock-banner {
  position: relative;
  aspect-ratio: var(--banner-ratio);
  overflow: hidden;
}
.mock-banner img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mock-banner-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: rgb(0 0 0 / 45%);
}
.mock-banner-content > strong {
  color: white;
  font-size: clamp(12px, 2.8cqw, 32px);
  text-shadow: 0 2px 4px rgb(0 0 0 / 40%);
}
.mock-search {
  display: flex;
  justify-content: space-between;
  width: 60%;
  overflow: hidden;
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: clamp(8px, 1.2cqw, 13px);
}
.mock-search span {
  padding: 9px 12px;
}
.mock-search span:last-child {
  background: var(--color-primary);
  color: var(--color-on-primary);
  white-space: nowrap;
}
.mock-content {
  padding: 20px 5%;
}
.mock-content-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  font-size: clamp(10px, 1.4cqw, 14px);
}
.mock-content-heading > span {
  font-size: 10px;
  color: var(--color-muted);
}
.mock-books {
  display: grid;
  grid-template-columns: repeat(var(--book-columns), minmax(0, 1fr));
  gap: 14px;
}
.mock-cover {
  height: clamp(40px, 8cqw, 90px);
  border-radius: 5px;
  background: var(--color-neutral-soft);
}
.mock-line {
  height: 5px;
  margin-top: 9px;
  border-radius: 3px;
  background: var(--color-hover);
}
.mock-line.short {
  width: 60%;
}
.mobile {
  max-height: none;
  max-width: var(--device-width);
  border: 5px solid var(--color-ink);
  border-radius: 30px;
}
.phone-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 600;
}
.phone-island {
  width: 72px;
  height: 18px;
  border-radius: 20px;
  background: var(--color-ink);
}
.mobile .mock-page {
  overflow: visible;
}
.mobile .mock-nav {
  padding: 12px 16px;
  font-size: 12px;
}
.mobile .mock-banner-content > strong {
  font-size: clamp(16px, 6cqw, 24px);
}
.mobile .mock-search {
  width: 100%;
  font-size: 11px;
}
.mobile .mock-books {
  gap: 10px;
}
.mobile .mock-cover {
  height: 90px;
}
.phone-bottom {
  display: flex;
  justify-content: center;
  padding: 12px;
}
.phone-bottom span {
  width: 100px;
  height: 4px;
  border-radius: 4px;
  background: var(--color-ink);
}
.preview-caption {
  white-space: nowrap;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.7;
}
@media (max-width: 767px) {
  .preview-toolbar {
    padding: 12px;
  }
  .preview-layout {
    margin: 0 12px;
  }
  .preview-stage {
    padding: 12px;
  }
}
</style>
