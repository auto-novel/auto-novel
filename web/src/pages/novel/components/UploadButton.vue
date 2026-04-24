<script lang="ts" setup>
import { PlusOutlined } from '@vicons/material';
import type {
  UploadCustomRequestOptions,
  UploadFileInfo,
  UploadInst,
} from 'naive-ui';

import { formatError } from '@/api';
import { WenkuNovelRepo } from '@/repos';
import { useNoticeStore, useWhoamiStore } from '@/stores';
import { RegexUtil } from '@/util';
import { getFullContent, getRawContent } from '@/util/file';
import type { UploadTask } from '@/api/novel/client';

const props = defineProps<{
  novelId: string;
  allowZh: boolean;
}>();

const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

async function beforeUpload({ file }: { file: UploadFileInfo }) {
  if (!whoami.value.isSignedIn) {
    message.info('请先登录');
    return false;
  }
  if (!file.file) {
    return false;
  }
  if (
    ['jp', 'zh', 'zh-jp', 'jp-zh'].some((prefix) =>
      file.file!.name.startsWith(prefix),
    )
  ) {
    message.error('不要上传本网站上生成的机翻文件');
    return false;
  }
  if (file.file.size > 1024 * 1024 * 40) {
    message.error('文件大小不能超过40MB');
    return false;
  }

  let content: string;
  try {
    content = await getFullContent(file.file);
  } catch (e) {
    console.error(e);
    message.error(`文件解析错误:${e}`);
    return false;
  }
  const charsCount = RegexUtil.countLanguageCharacters(content);
  if (charsCount.total < 500) {
    message.error('字数过少，请检查内容是不是图片');
    return false;
  }

  const p = (charsCount.jp + charsCount.ko) / charsCount.total;
  if (p < 0.33) {
    if (!props.allowZh) {
      message.error('疑似中文小说，文库不允许上传');
      return false;
    } else {
      file.url = 'zh';
    }
  } else {
    file.url = 'jp';
  }

  // 检查是否存在 opacity，如果存在则认为是机翻站小说，禁止上传
  try {
    const rawContents = await getRawContent(file.file);
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
      message.error('疑似机翻站小说，禁止上传');
      return false;
    }
  } catch {
    message.error('epub 解析失败');
    return false;
  }
}

const uploadTasks: Record<string, UploadTask<string>> = {};

async function cancelUpload(options: {
  file: UploadFileInfo;
  fileList: Array<UploadFileInfo>;
  index: number;
}): Promise<boolean> {
  await uploadTasks[options.file.id]?.abort?.();
  delete uploadTasks[options.file.id];
  return true;
}

const customRequest = async ({
  file,
  onFinish,
  onError,
  onProgress,
}: UploadCustomRequestOptions) => {
  if (!whoami.value.isSignedIn) {
    onError();
    return;
  }

  const type = file.url === 'jp' ? 'jp' : 'zh';
  const task: UploadTask<string> = WenkuNovelRepo.createVolume(
    props.novelId,
    file.name,
    type,
    file.file as File,
    (percent) => onProgress({ percent }),
  );
  uploadTasks[file.id] = task;
  task.promise
    .then(() => {
      delete uploadTasks[file.id];
      onFinish();
    })
    .catch(async (e) => {
      delete uploadTasks[file.id];
      // 用户手动取消上传，不报错
      if (e instanceof Error && e.message === '上传已取消') {
        message.error(`上传已取消`);
        return;
      }
      onError();
      message.error(`上传失败:${await formatError(e)}`);
    });
  return {
    abort: () => task.abort(),
  };
};

const noticeStore = useNoticeStore();
const { noticed } = storeToRefs(noticeStore);

const showRuleModal = ref(false);
const haveReadRule = computed(() => {
  const durationSinceLastRead = Date.now() - noticed.value.wenkuUploadRule;
  return durationSinceLastRead < 24 * 3600 * 1000;
});
const uploadRef = useTemplateRef<UploadInst>('upload');
const uploadVolumes = () => {
  showRuleModal.value = true;
  noticed.value.wenkuUploadRule = Date.now();
};
</script>

<template>
  <c-button
    v-if="!haveReadRule"
    label="上传"
    :icon="PlusOutlined"
    @action="uploadVolumes"
  />
  <n-upload
    ref="upload"
    accept=".txt,.epub"
    multiple
    :custom-request="customRequest"
    :show-trigger="haveReadRule"
    @before-upload="beforeUpload"
    :on-remove="cancelUpload"
  >
    <c-button label="上传" :icon="PlusOutlined" />
  </n-upload>

  <c-modal
    title="上传须知"
    v-model:show="showRuleModal"
    @after-leave="uploadRef?.openOpenFileDialog()"
  >
    <n-p>在上传小说之前，请务必遵守以下规则。</n-p>
    <n-ul>
      <n-li>
        日文章节上传前请确定里面有文本，单卷书压缩包超40MB里面大概率只有扫图无文本，这种是无法翻译的。
      </n-li>
      <n-li>EPUB文件大小超过40MB无法上传，请压缩里面的图片。</n-li>
      <n-li>不要上传已存在的分卷，现存的分卷有问题请联系管理员。</n-li>
      <n-li>分卷文件名应当只包含日文标题、卷数、分卷日文标题。</n-li>
    </n-ul>
    <n-p>由于文库小说还在开发中，规则也会变化，务必留意。</n-p>

    <template #action>
      <c-button label="确定" type="primary" @action="showRuleModal = false" />
    </template>
  </c-modal>
</template>
