<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import type { Epub, ParsedFile } from '@/util/file';
import { StandardNovel } from '@/util/file';
import { FileProcessor } from './file';

const props = defineProps<{
  files: ParsedFile[];
}>();

const convertEpubToTxt = async (epub: Epub) => {
  const novel = StandardNovel.fromEpub(epub);
  return await StandardNovel.toTxt(novel);
};

const convertAll = () =>
  FileProcessor.convertFiles(
    props.files.filter((file) => file.type === 'epub'),
    convertEpubToTxt,
    (e) => Toast.error(`发生错误：${e}`),
  );
</script>

<template>
  <n-flex vertical>
    <n-flex>
      <c-button label="转换" size="small" @action="convertAll" />
    </n-flex>
  </n-flex>
</template>
