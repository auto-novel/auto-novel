<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import { useFileDialog } from '@vueuse/core';
import { PlusOutlined } from '@vicons/material';

import { useLocalNovelImport } from '../useLocalNovelImport';

const props = defineProps<{
  favoredId?: string;
}>();
const emit = defineEmits<{
  done: [File];
}>();

const { running, importFiles } = useLocalNovelImport((file) =>
  emit('done', file),
);

// 文件选择与目录拖放共用同一导入流程。
const handleFiles = (files: File[]) => {
  void importFiles(files, props.favoredId ?? 'default');
};

const { open: openFiles, onChange } = useFileDialog({
  accept: '.txt,.epub,.srt',
  multiple: true,
  reset: true,
});
onChange((files) => {
  if (files && !running.value) handleFiles(Array.from(files));
});

const handleDropError = (error: unknown) => {
  Toast.error(`导入失败:读取拖拽目录失败\n${error}`);
};
</script>

<template>
  <UTooltip>
    <UButton
      color="neutral"
      variant="outline"
      class="rounded-full"
      :loading="running"
      :disabled="running"
      @click="!running && openFiles()"
    >
      <PlusOutlined v-if="!running" class="size-5" aria-hidden="true" />
      {{ running ? '导入中' : '添加' }}
    </UButton>

    <template #content>
      支持选择或拖拽导入Epub/Txt/Srt文件（不超过100MB）
      <br />
      文件仅保存在当前浏览器；有道/GPT支持韩语/英语小说
    </template>
  </UTooltip>

  <DropZone @drop="handleFiles" @error="handleDropError">
    拖拽文件到这里导入
  </DropZone>
</template>
