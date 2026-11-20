<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import { useFileDialog } from '@vueuse/core';
import { PlusOutlined } from '@vicons/material';

import { formatError } from '@/api';
import { WenkuNovelRepo } from '@/repos';
import { useNoticeStore, useWhoamiStore } from '@/stores';
import { RegexUtil } from '@/util';
import { getFullContent, getRawContent } from '@/util/file';

const props = defineProps<{
  novelId: string;
  allowZh: boolean;
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

async function validateFile(file: File): Promise<'jp' | 'zh' | false> {
  if (!whoami.value.isSignedIn) {
    Toast.info('请先登录');
    return false;
  }
  if (!/\.(txt|epub)$/.test(file.name)) {
    Toast.error('只支持 TXT/EPUB 文件');
    return false;
  }
  if (['jp', 'zh'].some((prefix) => file.name.startsWith(prefix))) {
    Toast.error('不要上传本网站上生成的机翻文件');
    return false;
  }
  if (file.size > 1024 * 1024 * 40) {
    Toast.error('文件大小不能超过40MB');
    return false;
  }

  let content: string;
  try {
    content = await getFullContent(file);
  } catch (e) {
    console.error(e);
    Toast.error(`文件解析错误:${e}`);
    return false;
  }
  const charsCount = RegexUtil.countLanguageCharacters(content);
  if (charsCount.total < 500) {
    Toast.error('字数过少，请检查内容是不是图片');
    return false;
  }

  const p = (charsCount.jp + charsCount.ko) / charsCount.total;
  if (p < 0.33 && !props.allowZh) {
    Toast.error('疑似中文小说，文库不允许上传');
    return false;
  }

  // 检查是否存在 opacity，如果存在则认为是机翻站小说，禁止上传
  try {
    const rawContents = await getRawContent(file);
    const contents = Object.values(rawContents);
    const totalFiles = contents.length;

    // 统计 opacity
    // <p style="opacity:0.4;">xxxxx</p>
    const opacityPattern =
      /(?:^|[\s;{"'])opacity\s*:\s*0(?:\.\d+)?(?=\s*(?:;|}|["']))/gim;

    let filesWithOpacity = 0;
    for (const content of contents) {
      const matches = content.match(opacityPattern);
      const opacityCount = matches ? matches.length : 0;

      // 单文件内 opacity 出现 5 个以上，才认为该文件“存在 opacity”。
      if (opacityCount > 5) {
        filesWithOpacity += 1;
      }
    }

    // 拦截条件：
    // 1) 大样本（>5 文件）>= 4 个命中
    // 2) 小样本（<=5 文件）>= 2 个命中
    // 3) 迷你样本（1 文件）>= 1 个命中
    const hitByLargeSet = totalFiles > 5 && filesWithOpacity >= 4;
    const hitBySmallSet =
      totalFiles > 1 && totalFiles <= 5 && filesWithOpacity >= 2;
    const hitByMiniSet = totalFiles === 1 && filesWithOpacity >= 1;

    if (hitByLargeSet || hitBySmallSet || hitByMiniSet) {
      Toast.error('疑似机翻站小说，禁止上传');
      return false;
    }
  } catch {
    Toast.error('epub 解析失败');
    return false;
  }
  return p < 0.33 ? 'zh' : 'jp';
}

type UploadItem = {
  id: number;
  name: string;
  status: 'validating' | 'uploading' | 'success' | 'error';
  progress: number;
  abort?: () => void;
};
const uploads = ref<UploadItem[]>([]);
let nextUploadId = 0;
const statusLabels = {
  validating: '校验中',
  uploading: '上传中',
  success: '上传成功',
  error: '上传失败',
};

const removeLabel = (item: UploadItem) =>
  item.status === 'validating' || item.status === 'uploading' ? '取消' : '移除';

const removeUpload = (item: UploadItem) => {
  uploads.value = uploads.value.filter((it) => it.id !== item.id);
  item.abort?.();
};
onBeforeUnmount(() => uploads.value.forEach(removeUpload));

const uploadFile = async (file: File) => {
  const novelId = props.novelId;
  const item = reactive<UploadItem>({
    id: nextUploadId++,
    name: file.name,
    status: 'validating',
    progress: 0,
  });
  uploads.value.push(item);
  try {
    const type = await validateFile(file);
    // 校验期间取消或离开页面后，不再发起请求。
    if (!uploads.value.includes(item)) return;
    if (type === false) {
      removeUpload(item);
      return;
    }
    if (!whoami.value.isSignedIn) {
      Toast.info('请先登录');
      removeUpload(item);
      return;
    }
    item.status = 'uploading';
    const task = WenkuNovelRepo.createVolume(
      novelId,
      file.name,
      type,
      file,
      (percent) => (item.progress = percent),
    );
    item.abort = task.abort;
    await task.promise;
    if (uploads.value.includes(item)) item.status = 'success';
  } catch (e) {
    if (!uploads.value.includes(item)) return;
    item.status = 'error';
    Toast.error(`上传失败:${await formatError(e)}`);
  } finally {
    item.abort = undefined;
  }
};

const { open: openFiles, onChange } = useFileDialog({
  accept: '.txt,.epub',
  multiple: true,
  reset: true,
});
onChange((files) => {
  if (files) Array.from(files).forEach((file) => void uploadFile(file));
});

const noticeStore = useNoticeStore();
const { noticed } = storeToRefs(noticeStore);

const showRuleModal = ref(false);
const uploadVolumes = () => {
  const durationSinceLastRead = Date.now() - noticed.value.wenkuUploadRule;
  if (durationSinceLastRead < 24 * 3600 * 1000) openFiles();
  else showRuleModal.value = true;
};
const confirmRules = () => {
  noticed.value.wenkuUploadRule = Date.now();
  showRuleModal.value = false;
  openFiles();
};
</script>

<template>
  <UButton
    :icon="PlusOutlined"
    color="neutral"
    variant="outline"
    @click="uploadVolumes"
  >
    上传
  </UButton>
  <div v-if="uploads.length" class="w-full space-y-2 text-sm">
    <div v-for="item in uploads" :key="item.id" class="space-y-1">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate" :title="item.name">
          {{ item.name }}
        </span>
        <span :class="item.status === 'error' ? 'text-error' : 'text-muted'">
          {{ statusLabels[item.status] }}
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="`${removeLabel(item)} ${item.name}`"
          @click="removeUpload(item)"
        >
          {{ removeLabel(item) }}
        </UButton>
      </div>
      <UProgress
        v-if="item.status === 'uploading'"
        :model-value="item.progress"
        :aria-label="`${item.name} 上传进度`"
      />
    </div>
  </div>

  <UModal
    title="上传须知"
    v-model:open="showRuleModal"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    class="w-150"
  >
    <template #body>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        在上传小说之前，请务必遵守以下规则。
      </p>
      <ul class="content-list">
        <li>
          日文章节上传前请确定里面有文本，单卷书压缩包超40MB里面大概率只有扫图无文本，这种是无法翻译的。
        </li>
        <li>EPUB文件大小超过40MB无法上传，请压缩里面的图片。</li>
        <li>不要上传已存在的分卷，现存的分卷有问题请联系管理员。</li>
        <li>分卷文件名应当只包含日文标题、卷数、分卷日文标题。</li>
      </ul>
      <p class="my-4 text-sm leading-[1.6] text-default first:mt-0 last:mb-0">
        由于文库小说还在开发中，规则也会变化，务必留意。
      </p>
    </template>
    <template #footer>
      <UButton variant="solid" color="primary" @click="confirmRules">
        确定
      </UButton>
    </template>
  </UModal>
</template>
