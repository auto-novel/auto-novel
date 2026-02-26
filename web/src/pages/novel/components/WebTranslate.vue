<script lang="ts" setup>
import { useKeyModifier } from '@vueuse/core';
import ky from 'ky';

import { WebNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { TranslateTaskDescriptor } from '@/model/Translator';
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
  baidu: number;
  youdao: number;
  gpt: number;
  sakura: number;
  murasaki: number;
  glossary: { [key: string]: string };
}>();

const { providerId, novelId, titleJp, titleZh, total } = props;

const emit = defineEmits<{
  'update:jp': [number];
  'update:baidu': [number];
  'update:youdao': [number];
  'update:gpt': [number];
  'update:murasaki': [number];
}>();

const message = useMessage();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const translateOptions = useTemplateRef('translateOptions');
const translateTask = useTemplateRef('translateTask');
const startTranslateTask = (translatorId: 'baidu' | 'youdao') =>
  translateTask?.value?.startTask(
    { type: 'web', providerId, novelId },
    translateOptions.value!.getTranslateTaskParams(),
    { id: translatorId },
  );

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

const pressControl = useKeyModifier('Control');
const submitJob = (id: 'gpt' | 'sakura' | 'murasaki') => {
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
  <n-text v-if="!whoami.isSignedIn">游客无法使用翻译功能，请先登录。</n-text>
  <n-text v-else-if="setting.enabledTranslator.length === 0">
    没有翻译器启用。
  </n-text>
  <TranslateOptions
    v-else
    ref="translateOptions"
    :gnid="GenericNovelId.web(providerId, novelId)"
    :glossary="glossary"
  />

  <n-flex vertical style="margin-top: 16px">
    <n-text>
      总计 {{ total }} / 百度 {{ baidu }} / 有道 {{ youdao }} / GPT {{ gpt }} /
      Sakura {{ sakura }} / Murasaki {{ murasaki }}
    </n-text>

    <template v-if="whoami.isSignedIn && setting.enabledTranslator.length > 0">
      <n-button-group>
        <c-button
          v-if="setting.enabledTranslator.includes('baidu')"
          label="更新百度"
          :round="false"
          @action="startTranslateTask('baidu')"
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
        <c-button
          v-if="setting.enabledTranslator.includes('murasaki')"
          label="排队Murasaki"
          :round="false"
          @action="submitJob('murasaki')"
        />
      </n-button-group>
    </template>

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
      <c-button
        label="导入日文至工作区"
        :round="false"
        @action="importToWorkspace"
      />
    </n-button-group>
  </n-flex>

  <TranslateTask
    ref="translateTask"
    @update:jp="(zh) => emit('update:jp', zh)"
    @update:baidu="(zh) => emit('update:baidu', zh)"
    @update:youdao="(zh) => emit('update:youdao', zh)"
    @update:gpt="(zh) => emit('update:gpt', zh)"
    @update:murasaki="(zh) => emit('update:murasaki', zh)"
    style="margin-top: 20px"
  />
</template>
