<script lang="ts" setup>
import { useKeyModifier } from '@vueuse/core';
import ky from 'ky';

import { CrawlerService } from '@/domain/crawler';
import { WebNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { TranslateTaskDescriptor } from '@/model/Translator';
import { doAction } from '@/pages/util';
import {
  useLocalVolumeStore,
  useSettingStore,
  useWhoamiStore,
  useWorkspaceStore,
} from '@/stores';

const props = defineProps<{
  providerId: string;
  novelId: string;
  titleJp: string;
  titleZh?: string;
  total: number;
  jp: number;
  youdao: number;
  gpt: number;
  sakura: number;
  glossary: { [key: string]: string };
}>();

const { providerId, novelId, titleJp, titleZh, total } = props;

const emit = defineEmits<{
  'update:jp': [number];
  'update:youdao': [number];
  'update:gpt': [number];
}>();

const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const translateOptions = useTemplateRef('translateOptions');
const translateTask = useTemplateRef('translateTask');
const startTranslateTask = (translatorId: 'youdao') =>
  translateTask?.value?.startTask(
    { type: 'web', providerId, novelId },
    translateOptions.value!.getTranslateTaskParams(),
    { id: translatorId },
  );
const updateNovel = () =>
  doAction(
    CrawlerService.updateWebNovel(providerId, novelId),
    '更新小说',
    message,
  );

const importToWorkspace = async () => {
  const blob = await ky.get(files.value.jp.url).blob();
  const file = new File([blob], files.value.jp.filename);

  const repo = await useLocalVolumeStore();
  await repo
    .createVolume(file, 'default')
    .then(() => repo.updateGlossary(file.name, toRaw(props.glossary)))
    .then(() => message.success('导入成功'))
    .catch((error) => message.error(`导入失败:${error}`));
};

const files = computed(() => {
  const title =
    setting.value.downloadFilenameType === 'jp' ? titleJp : titleZh ?? titleJp;

  const { mode, translationsMode, translations, type } =
    setting.value.downloadFormat;

  return {
    jp: WebNovelApi.createFileUrl({
      providerId,
      novelId,
      mode: 'jp',
      translationsMode,
      translations: [],
      type,
      title,
    }),
    zh: WebNovelApi.createFileUrl({
      providerId,
      novelId,
      mode: mode,
      translationsMode,
      translations,
      type,
      title,
    }),
  };
});

const pressControl = useKeyModifier('Control');
const submitJob = (id: 'gpt' | 'sakura') => {
  const { startIndex, endIndex, level, forceMetadata } =
    translateOptions.value!.getTranslateTaskParams();
  const taskNumber = translateOptions.value!.getTaskNumber();

  if (endIndex <= startIndex || startIndex >= total) {
    message.error('排队失败：没有选中章节');
    return;
  }

  const tasks: string[] = [];
  if (taskNumber > 1) {
    const taskSize = (Math.min(endIndex, total) - startIndex) / taskNumber;
    for (let i = 0; i < taskNumber; i++) {
      const start = Math.round(startIndex + i * taskSize);
      const end = Math.round(startIndex + (i + 1) * taskSize);
      if (end > start) {
        const task = TranslateTaskDescriptor.web(providerId, novelId, {
          level,
          forceMetadata,
          startIndex: start,
          endIndex: end,
        });
        tasks.push(task);
      }
    }
  } else {
    const task = TranslateTaskDescriptor.web(providerId, novelId, {
      level,
      forceMetadata,
      startIndex,
      endIndex,
    });
    tasks.push(task);
  }

  const workspace = useWorkspaceStore(id);

  const results = tasks.map((task) => {
    const job = {
      task,
      description: titleZh ?? titleJp,
      createAt: Date.now(),
    };
    const success = workspace.addJob(job);
    if (success) {
      if (setting.value.autoTopJobWhenAddTask || pressControl.value) {
        workspace.topJob(job);
      }
    }
    return success;
  });
  if (results.length === 1 && !results[0]) {
    message.error('排队失败：翻译任务已经存在');
  } else {
    message.success('排队成功');
  }
};
</script>

<template>
  <n-flex vertical style="margin-top: 8px">
    <n-text>
      总计 {{ total }} / 有道 {{ youdao }} / GPT {{ gpt }} / Sakura
      {{ sakura }}
    </n-text>

    <n-button-group>
      <c-button
        label="下载原文"
        :round="false"
        tag="a"
        :href="files.jp.url"
        :download="files.jp.filename"
        target="_blank"
      />
      <c-button
        label="下载机翻"
        :round="false"
        tag="a"
        :href="files.zh.url"
        :download="files.zh.filename"
        target="_blank"
      />
      <DownloadOptionsButton
        :round="false"
        :show-file-type="true"
        :show-filename-type="true"
      />
    </n-button-group>
  </n-flex>

  <div style="margin: 28px" />

  <n-text v-if="!whoami.isSignedIn">游客无法使用翻译功能，请先登录。</n-text>
  <n-text v-else-if="setting.enabledTranslator.length === 0">
    没有翻译器启用。
  </n-text>
  <TranslateOptions
    v-else
    ref="translateOptions"
    :gnid="GenericNovelId.web(providerId, novelId)"
  />

  <n-flex
    v-if="whoami.isSignedIn && setting.enabledTranslator.length > 0"
    style="margin-top: 16px"
  >
    <n-button-group>
      <GlossaryButton
        :gnid="GenericNovelId.web(providerId, novelId)"
        :value="glossary"
        :round="false"
      />
      <c-button label="导入工作区" :round="false" @action="importToWorkspace" />
    </n-button-group>

    <n-button-group>
      <c-button
        v-if="whoami.hasNovelAccess"
        label="更新原文"
        :round="false"
        @action="updateNovel()"
      />
      <c-button
        v-if="setting.enabledTranslator.includes('youdao')"
        label="更新有道"
        :round="false"
        @action="startTranslateTask('youdao')"
      />
      <c-button
        v-if="setting.enabledTranslator.includes('gpt')"
        label="排队GPT"
        :round="false"
        @action="submitJob('gpt')"
      />
      <c-button
        v-if="setting.enabledTranslator.includes('sakura')"
        label="排队Sakura"
        :round="false"
        @action="submitJob('sakura')"
      />
    </n-button-group>
  </n-flex>

  <TranslateTask
    ref="translateTask"
    @update:jp="(zh) => emit('update:jp', zh)"
    @update:youdao="(zh) => emit('update:youdao', zh)"
    @update:gpt="(zh) => emit('update:gpt', zh)"
    style="margin-top: 20px"
  />
</template>
