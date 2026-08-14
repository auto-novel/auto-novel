<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core';

defineProps<{
  maxHeightPercentage?: number;
  extraHeight?: number;
  // 内容自身已是滚动容器时开启，跳过外层滚动条，避免嵌套出现两条滚动条
  contentScrollable?: boolean;
}>();

const { height } = useWindowSize();
</script>

<template>
  <n-modal
    :auto-focus="false"
    preset="card"
    :bordered="false"
    :closable="$attrs.title !== undefined || $slots.header !== undefined"
    size="large"
    transform-origin="center"
    :block-scroll="false"
    style="width: min(600px, calc(100% - 16px))"
  >
    <template #header v-if="$slots.header">
      <slot name="header" />
    </template>
    <slot name="header-extra" />

    <div v-if="contentScrollable" style="padding-right: 16px">
      <slot />
    </div>
    <n-scrollbar
      v-else
      trigger="none"
      :style="{
        'max-height': `${((maxHeightPercentage ?? 60) / 100) * height - (extraHeight ?? 0)}px`,
      }"
    >
      <div style="padding-right: 16px">
        <slot />
      </div>
    </n-scrollbar>

    <template #action v-if="$slots.action">
      <n-flex justify="end">
        <slot name="action" />
      </n-flex>
    </template>
  </n-modal>
</template>
