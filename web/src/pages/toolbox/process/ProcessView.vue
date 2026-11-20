<script lang="ts" setup>
import { Toast, getApiErrorMessage, XDropZone, XPage } from '@novelia/web-kit';
import { DeleteOutlineOutlined, PlusOutlined } from '@vicons/material';
import { useFileDialog } from '@vueuse/core';

import { useLocalVolumeStore } from '@/stores';
import type { ParsedFile } from '@/util/file';
import { parseFile } from '@/util/file';

import LocalVolumePickerDrawer from '../local-volume/LocalVolumePickerDrawer.vue';
import FileCard from './FileCard.vue';
import FileCompress from './FileCompress.vue';
import FileConvert from './FileConvert.vue';
import FileOcr from './FileOcr.vue';
import FileGlossary from './FileGlossary.vue';

const tabs = [
  { label: '术语表', value: 'glossary', slot: 'glossary' },
  { label: 'EPUB：压缩图片', value: 'compress', slot: 'compress' },
  { label: 'TXT：修复OCR换行', value: 'ocr', slot: 'ocr' },
  { label: 'EPUB：转换成TXT', value: 'convert', slot: 'convert' },
];

const files = shallowRef<ParsedFile[]>([]);

const loadFile = async (file: File) => {
  if (files.value.find((it) => it.name === file.name) !== undefined) {
    Toast.warning('文件已经载入');
    return;
  }
  try {
    const parsedFile = await parseFile(file, ['txt', 'epub']);
    if (files.value.some((it) => it.name === parsedFile.name)) {
      Toast.warning('文件已经载入');
      return;
    }
    files.value = [...files.value, parsedFile];
  } catch (e) {
    Toast.warning(`${e}`);
  }
};

const removeFile = (name: string) => {
  files.value = files.value.filter((it) => !(it.name === name));
};

const clearFile = () => {
  files.value = [];
};

const loadLocalFile = (volumeId: string) =>
  Toast.promise(
    useLocalVolumeStore()
      .then((repo) => repo.getFile(volumeId))
      .then((file) => {
        if (file === undefined) throw '小说不存在';
        return loadFile(file.file);
      }),
    { error: (reason) => getApiErrorMessage(reason, '文件载入失败') },
  ).catch(() => {});

const loadFiles = async (files: File[]) => {
  for (const file of files) await loadFile(file);
};

const { open: openFiles, onChange } = useFileDialog({
  accept: '.txt,.epub',
  multiple: true,
  reset: true,
});
onChange((files) => {
  if (files) void loadFiles(Array.from(files));
});

const handleDropError = (error: unknown) => {
  Toast.warning(`文件载入失败:读取拖拽目录失败\n${error}`);
};

const showListModal = ref(false);
</script>

<template>
  <XPage>
    <UPageHeader title="小说处理" />

    <div class="flex flex-wrap gap-x-3 gap-y-2">
      <UButton
        :icon="PlusOutlined"
        color="neutral"
        variant="outline"
        @click="openFiles()"
      >
        加载文件
      </UButton>

      <UButton
        :icon="PlusOutlined"
        color="neutral"
        variant="outline"
        @click="showListModal = true"
      >
        本地书架
      </UButton>
      <UButton
        :icon="DeleteOutlineOutlined"
        color="neutral"
        variant="outline"
        @click="clearFile"
      >
        清空
      </UButton>
    </div>

    <div class="mt-4 flex flex-col gap-y-2">
      <span class="text-default" v-for="file of files" :key="file.name">
        <file-card :file="file" @delete="removeFile(file.name)" />
      </span>
    </div>

    <UTabs
      :items="tabs"
      default-value="glossary"
      variant="pill"
      class="mt-12 min-w-0 w-full"
      :ui="{
        list: 'min-w-0 max-w-full flex-nowrap overflow-x-auto',
        trigger: 'flex-none whitespace-nowrap sm:flex-1',
        content: 'p-0',
      }"
    >
      <template #glossary>
        <file-glossary :files="files" />
      </template>
      <template #compress>
        <file-compress :files="files" />
      </template>
      <template #ocr>
        <file-ocr :files="files" />
      </template>
      <template #convert>
        <file-convert v-model:files="files" />
      </template>
    </UTabs>

    <local-volume-picker-drawer
      v-model:show="showListModal"
      @volume-loaded="loadLocalFile"
    />

    <XDropZone directories @drop="loadFiles" @error="handleDropError">
      拖拽文件到这里加载
    </XDropZone>
  </XPage>
</template>
