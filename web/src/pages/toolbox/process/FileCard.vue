<script lang="ts" setup>
import { DeleteOutlineOutlined, RemoveRedEyeOutlined } from '@vicons/material';

import type { ParsedFile } from '@/util/file';

defineProps<{
  file: ParsedFile;
}>();

const emit = defineEmits<{
  delete: [];
}>();

const showPreviewModal = ref(false);
</script>

<template>
  <div class="flex flex-nowrap items-center justify-start gap-1 text-[12px]">
    <UTooltip text="预览">
      <UButton
        square
        size="sm"
        color="primary"
        variant="link"
        class="rounded-full p-0"
        @click="showPreviewModal = true"
        aria-label="预览"
      >
        <component
          :is="RemoveRedEyeOutlined"
          class="size-4.5 shrink-0"
          aria-hidden="true"
        />
      </UButton>
    </UTooltip>
    <UTooltip text="移除">
      <UButton
        square
        size="sm"
        color="error"
        variant="link"
        class="rounded-full p-0"
        @click="emit('delete')"
        aria-label="移除"
      >
        <component
          :is="DeleteOutlineOutlined"
          class="size-4.5 shrink-0"
          aria-hidden="true"
        />
      </UButton>
    </UTooltip>
    <n-text>{{ file.name }}</n-text>
  </div>

  <UModal
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    title="预览（前100行）"
    v-model:open="showPreviewModal"
    class="w-[600px]"
  >
    <template #body>
      <n-text>暂未实现</n-text>
    </template>
  </UModal>
</template>
