<script lang="ts" setup>
import { Toast, getApiErrorMessage, XPage } from '@novelia/web-kit';
import { DeleteOutlineOutlined, PlusOutlined } from '@vicons/material';
import type { UploadCustomRequestOptions } from 'naive-ui';

import { useLocalVolumeStore } from '@/stores';
import type { ParsedFile } from '@/util/file';
import { parseFile } from '@/util/file';

import LocalVolumePickerDrawer from '../local-volume/LocalVolumePickerDrawer.vue';
import FileCard from './FileCard.vue';
import FileCompress from './FileCompress.vue';
import FileConvert from './FileConvert.vue';
import FileOcr from './FileOcr.vue';
import FileGlossary from './FileGlossary.vue';

const files = shallowRef<ParsedFile[]>([]);

const loadFile = async (file: File) => {
  if (files.value.find((it) => it.name === file.name) !== undefined) {
    Toast.warning('文件已经载入');
    return;
  }
  try {
    const parsedFile = await parseFile(file, ['txt', 'epub']);
    files.value.push(parsedFile);
    files.value = [...files.value];
    triggerRef(files);
  } catch (e) {
    Toast.warning(`${e}`);
  }
};

const removeFile = (name: string) => {
  files.value = files.value.filter((it) => !(it.name === name));
  triggerRef(files);
};

const clearFile = () => {
  files.value = [];
  triggerRef(files);
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

const customRequest = ({
  file,
  onFinish,
  onError,
}: UploadCustomRequestOptions) => {
  if (!file.file) return;
  loadFile(file.file)
    .then(onFinish)
    .catch((err) => {
      Toast.error('文件载入失败:' + err);
      onError();
    });
};

const showListModal = ref(false);
</script>

<template>
  <XPage>
    <UPageHeader title="小说处理" />

    <div class="flex flex-wrap gap-x-3 gap-y-2">
      <div>
        <n-upload
          :show-file-list="false"
          accept=".txt,.epub"
          multiple
          directory-dnd
          :custom-request="customRequest"
        >
          <UButton
            :icon="PlusOutlined"
            color="neutral"
            variant="outline"
            class="rounded-full"
          >
            加载文件
          </UButton>
        </n-upload>
      </div>

      <UButton
        :icon="PlusOutlined"
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="showListModal = true"
      >
        本地书架
      </UButton>
      <UButton
        :icon="DeleteOutlineOutlined"
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="clearFile"
      >
        清空
      </UButton>
    </div>

    <div class="mt-4 flex flex-col gap-y-2">
      <span class="text-ink" v-for="file of files" :key="file.name">
        <file-card :file="file" @delete="removeFile(file.name)" />
      </span>
    </div>

    <n-tabs class="mt-12" type="segment" animated>
      <n-tab-pane name="0" tab="术语表">
        <file-glossary :files="files" />
      </n-tab-pane>
      <n-tab-pane name="1" tab="EPUB：压缩图片">
        <file-compress :files="files" />
      </n-tab-pane>
      <n-tab-pane name="2" tab="TXT：修复OCR换行">
        <file-ocr :files="files" />
      </n-tab-pane>
      <n-tab-pane name="3" tab="EPUB：转换成TXT">
        <file-convert v-model:files="files" />
      </n-tab-pane>
    </n-tabs>

    <local-volume-picker-drawer
      v-model:show="showListModal"
      @volume-loaded="loadLocalFile"
    />
  </XPage>
</template>
