<script setup lang="ts">
import { Inventory2Outlined } from '@vicons/material';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** 无额外占位和内边距，用于卷列表、文件列表等内联空状态。 */
    inline?: boolean;
  }>(),
  { title: '暂无内容' },
);
</script>

<template>
  <!-- 保留迁移前 XEmpty compact 的视觉，避免 Nuxt 默认卡片背景、描边和响应式留白。 -->
  <UEmpty
    :title="title"
    :description="description"
    variant="naked"
    :ui="{
      root: [
        'gap-0 rounded-none text-center',
        inline ? 'min-h-0 p-0 sm:p-0 lg:p-0' : 'min-h-52 p-6 sm:p-6 lg:p-6',
      ].join(' '),
      header: 'max-w-none gap-0',
      title: 'mt-3 text-sm font-medium text-ink text-wrap',
      description: 'mt-1 text-xs text-muted text-wrap',
      body: 'mt-5 max-w-none gap-0',
    }"
  >
    <template #leading>
      <div
        class="mx-auto grid size-12 place-items-center rounded-full bg-paper text-muted"
        aria-hidden="true"
      >
        <Inventory2Outlined class="size-6" />
      </div>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UEmpty>
</template>
