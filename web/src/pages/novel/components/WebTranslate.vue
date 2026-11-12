<script lang="ts" setup>
import { Toast, getApiErrorMessage } from '@novelia/web-kit';

import ky from 'ky';

import { WebNovelApi } from '@/api';
import { GenericNovelId } from '@/model/Common';
import { TranslateTaskDescriptor } from '@/domain/translator';
import {
  summarizeQueueResults,
  useLocalVolumeStore,
  useSettingStore,
  useWhoamiStore,
  useWorkspaceStore,
} from '@/stores';
import { useShouldTopJob } from '@/util';

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
}>();

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

const importToWorkspace = () =>
  Toast.promise(
    (async () => {
      const blob = await ky.get(files.value.jp.url).blob();
      const file = new File([blob], files.value.jp.filename);
      const repo = await useLocalVolumeStore();
      await repo.createVolume(file, 'default');
      await repo.updateGlossary(file.name, toRaw(props.glossary));
    })(),
    {
      success: '导入成功',
      error: (reason) => getApiErrorMessage(reason, '导入失败'),
    },
  ).catch(() => {});

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

const shouldTopJob = useShouldTopJob();
const submitJob = (id: 'gpt' | 'sakura') => {
  const {
    startIndex = 0,
    endIndex,
    level,
    forceMetadata,
    useBrowserCrawler,
  } = translateOptions.value!.getTranslateTaskParams();

  if (
    (endIndex !== undefined && endIndex <= startIndex) ||
    startIndex >= total
  ) {
    Toast.error('排队失败：没有选中章节');
    return;
  }

  const task = TranslateTaskDescriptor.web(providerId, novelId, {
    level,
    forceMetadata,
    useBrowserCrawler,
    startIndex,
    endIndex,
  });
  const workspace = useWorkspaceStore(id);
  const job = {
    task,
    description: titleZh ?? titleJp,
    createAt: Date.now(),
  };
  const success = workspace.addJob(job);
  if (success && (setting.value.autoTopJobWhenAddTask || shouldTopJob.value)) {
    workspace.topJob(job);
  }
  const { type, text } = summarizeQueueResults([success]);
  Toast[type](text);
};
</script>

<template>
  <div class="mt-2 flex flex-col gap-y-2">
    <span class="text-ink">
      总计 {{ total }} / 有道 {{ youdao }} / GPT {{ gpt }} / Sakura
      {{ sakura }}
    </span>

    <UFieldGroup>
      <UButton
        color="neutral"
        variant="outline"
        :href="files.jp.url"
        :download="files.jp.filename"
        target="_blank"
      >
        下载原文
      </UButton>
      <UButton
        color="neutral"
        variant="outline"
        :href="files.zh.url"
        :download="files.zh.filename"
        target="_blank"
      >
        下载机翻
      </UButton>
      <DownloadOptionsButton
        class="rounded-md"
        :show-file-type="true"
        :show-filename-type="true"
      />
    </UFieldGroup>
  </div>

  <div class="m-7" />

  <span class="text-ink" v-if="!whoami.isSignedIn">
    游客无法使用翻译功能，请先登录。
  </span>
  <span class="text-ink" v-else-if="setting.enabledTranslator.length === 0">
    没有翻译器启用。
  </span>
  <TranslateOptions
    v-else
    ref="translateOptions"
    :gnid="GenericNovelId.web(providerId, novelId)"
  />

  <div
    class="mt-4 flex flex-wrap gap-x-3 gap-y-2"
    v-if="whoami.isSignedIn && setting.enabledTranslator.length > 0"
  >
    <ActionButton class="rounded-md" :action="importToWorkspace">
      导入工作区
    </ActionButton>

    <UFieldGroup>
      <ActionButton
        class="rounded-md"
        v-if="setting.enabledTranslator.includes('youdao')"
        :action="() => startTranslateTask('youdao')"
      >
        更新有道
      </ActionButton>
      <ActionButton
        class="rounded-md"
        v-if="setting.enabledTranslator.includes('gpt')"
        :action="() => submitJob('gpt')"
      >
        排队GPT
      </ActionButton>
      <ActionButton
        class="rounded-md"
        v-if="setting.enabledTranslator.includes('sakura')"
        :action="() => submitJob('sakura')"
      >
        排队Sakura
      </ActionButton>
    </UFieldGroup>
  </div>

  <TranslateTask
    ref="translateTask"
    @update:jp="(zh) => emit('update:jp', zh)"
    @update:youdao="(zh) => emit('update:youdao', zh)"
    class="mt-5"
  />
</template>
