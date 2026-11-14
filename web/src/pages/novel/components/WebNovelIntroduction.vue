<script lang="ts" setup>
import { KeyboardArrowDownRound } from '@vicons/material';
import { useResizeObserver } from '@vueuse/core';
import { useId } from 'vue';

const props = defineProps<{
  introductionJp: string;
  introductionZh?: string;
}>();

const introduction = computed(() =>
  [props.introductionZh, props.introductionJp]
    .filter((text) => text?.trim())
    .join('\n\n'),
);

const contentId = useId();
const content = ref<HTMLElement>();
const expanded = ref(false);
const overflowing = ref(false);
const previewHeight = ref(0);
const collapsed = computed(() => overflowing.value && !expanded.value);

// 测量未截断的正文，内容、宽度或字号变化后重新判断是否需要折叠。
useResizeObserver(content, () => {
  if (!content.value) return;
  previewHeight.value =
    Number.parseFloat(getComputedStyle(content.value).lineHeight) * 6;
  overflowing.value = content.value.scrollHeight > previewHeight.value + 1;
});

watch(introduction, () => {
  expanded.value = false;
});
</script>

<template>
  <div>
    <div
      :id="contentId"
      class="introduction-preview"
      :class="{ 'is-collapsed': collapsed }"
      :style="{ maxHeight: collapsed ? `${previewHeight}px` : undefined }"
    >
      <div ref="content" class="introduction-content">
        {{ introduction || '暂无简介' }}
      </div>
    </div>
    <div v-if="collapsed" class="introduction-action">
      <UButton
        :trailing-icon="KeyboardArrowDownRound"
        :ui="{ trailingIcon: 'ml-1 size-4 shrink-0' }"
        variant="link"
        color="primary"
        class="introduction-toggle gap-0"
        :aria-expanded="expanded"
        :aria-controls="contentId"
        @click="expanded = true"
      >
        展开全部简介
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.introduction-preview {
  overflow: hidden;
}

.introduction-preview.is-collapsed {
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 calc(100% - 1.5em),
    transparent
  );
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.5em), transparent);
}

.introduction-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}

.introduction-action {
  display: flex;
  justify-content: center;
}

.introduction-toggle {
  min-height: 28px;
  padding: 0 12px;
}

@media (pointer: coarse) {
  .introduction-toggle {
    min-height: 44px;
  }
}
</style>
