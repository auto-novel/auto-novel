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
  <div class="flex flex-col gap-y-2">
    <div class="flex flex-wrap gap-x-3 gap-y-2">
      <ActionButton size="sm" class="text-sm/4" :action="convertAll">
        转换
      </ActionButton>
    </div>
  </div>
</template>
