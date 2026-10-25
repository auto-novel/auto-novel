<script lang="ts" setup>
import { Toast, XButton, XFilePicker, XTooltip } from '@novelia/web-kit';
import { PlusOutlined } from '@vicons/material';

import { useBookshelfLocalStore } from '../BookshelfLocalStore';

const props = defineProps<{
  favoredId?: string;
}>();
const emit = defineEmits<{
  done: [File];
}>();

const store = useBookshelfLocalStore();

const validateFile = (file: File) => {
  if (
    !(
      file.name.endsWith('.txt') ||
      file.name.endsWith('.srt') ||
      file.name.endsWith('.epub')
    )
  ) {
    Toast.error(`上传失败:文件类型不允许\n文件名： ${file.name}`);
    return false;
  }
  if (file.size > 1024 * 1024 * 100) {
    Toast.error(`上传失败:文件大小不能超过100MB\n文件名: ${file.name}`);
    return false;
  }
  return true;
};

const uploadFile = (file: File) =>
  store
    .addVolume(file, props.favoredId ?? 'default')
    .catch((error: unknown) => {
      Toast.error(`上传失败:${error}\n文件名: ${file.name}`);
      throw error;
    });

// 文件选择与目录拖放共用业务校验和导入逻辑。
const importFiles = (files: File[]) => {
  for (const file of files) {
    if (!validateFile(file)) continue;
    void uploadFile(file)
      .then(() => emit('done', file))
      .catch(() => {
        // uploadFile 已显示与按钮上传相同的失败提示。
      });
  }
};

const handleDropError = (error: unknown) => {
  Toast.error(`上传失败:读取拖拽目录失败\n${error}`);
};
</script>

<template>
  <XFilePicker accept=".txt,.epub,.srt" multiple @select="importFiles">
    <template #trigger="{ open, disabled }">
      <XTooltip>
        <template #trigger>
          <XButton :disabled="disabled" @click="open">
            <PlusOutlined class="size-5" aria-hidden="true" />
            添加
          </XButton>
        </template>
        支持拖拽上传Epub/Txt/Srt文件
        <br />
        有道/GPT支持韩语/英语小说
      </XTooltip>
    </template>
  </XFilePicker>
  <DropZone @drop="importFiles" @error="handleDropError">
    拖拽文件到这里上传
  </DropZone>
</template>
