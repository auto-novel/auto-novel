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
  <div class="flex items-center gap-1 text-[12px]">
    <UTooltip text="预览">
      <UButton
        :icon="RemoveRedEyeOutlined"
        square
        size="sm"
        color="primary"
        variant="link"
        class="rounded-full p-0"
        @click="showPreviewModal = true"
        aria-label="预览"
      />
    </UTooltip>
    <UTooltip text="移除">
      <UButton
        :icon="DeleteOutlineOutlined"
        square
        size="sm"
        color="error"
        variant="link"
        class="rounded-full p-0"
        @click="emit('delete')"
        aria-label="移除"
      />
    </UTooltip>
    <span class="text-ink">{{ file.name }}</span>
  </div>

  <UModal
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    title="预览（前100行）"
    v-model:open="showPreviewModal"
    class="w-150"
  >
    <template #body>
      <span class="text-ink">暂未实现</span>
    </template>
  </UModal>
</template>
