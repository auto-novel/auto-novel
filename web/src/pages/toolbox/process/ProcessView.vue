<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
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
    { error: '文件载入失败' },
  );

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
  <div class="layout-content">
    <n-h1>小说处理</n-h1>

    <n-flex>
      <div>
        <n-upload
          :show-file-list="false"
          accept=".txt,.epub"
          multiple
          directory-dnd
          :custom-request="customRequest"
        >
          <c-button label="加载文件" :icon="PlusOutlined" />
        </n-upload>
      </div>

      <c-button
        label="本地书架"
        :icon="PlusOutlined"
        @action="showListModal = true"
      />
      <c-button
        label="清空"
        :icon="DeleteOutlineOutlined"
        @action="clearFile"
      />
    </n-flex>

    <n-flex vertical style="margin-top: 16px">
      <n-text v-for="file of files" :key="file.name">
        <file-card :file="file" @delete="removeFile(file.name)" />
      </n-text>
    </n-flex>

    <n-tabs type="segment" animated style="margin-top: 48px">
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
  </div>
</template>
