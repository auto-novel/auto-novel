<script lang="ts" setup>
import { useKeyModifier } from '@vueuse/core';

import { WebNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { TranslateTaskDescriptor } from '@/model/Translator';
import { useSettingStore, useWhoamiStore, useWorkspaceStore } from '@/stores';

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
      总计 {{ total }} / 有道 {{ youdao }} / GPT {{ gpt }} / Sakura
      {{ sakura }}
    </n-text>

    <template v-if="whoami.isSignedIn && setting.enabledTranslator.length > 0">
      <n-button-group>
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
      <DownloadOptionsButton
        :round="false"
        :show-file-type="true"
        :show-filename-type="true"
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
