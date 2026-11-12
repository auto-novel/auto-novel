<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import { FileDownloadOutlined } from '@vicons/material';

import { WenkuNovelApi } from '@/api';
import type { TranslateTaskOptions } from '@/domain/translator';
import { TranslateTaskDescriptor } from '@/domain/translator';
import type { VolumeJpDto } from '@/model/WenkuNovel';
import { useSettingStore, useWhoamiStore, useWorkspaceStore } from '@/stores';
import { useShouldTopJob } from '@/util';

const { novelId, volume, getParams } = defineProps<{
  novelId: string;
  volume: VolumeJpDto;
  getParams: () => TranslateTaskOptions;
}>();

const emit = defineEmits<{
  delete: [];
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const translateTask = useTemplateRef('translateTask');
const startTranslateTask = (translatorId: 'youdao') => {
  return translateTask?.value?.startTask(
    { type: 'wenku', novelId, volumeId: volume.volumeId },
    getParams(),
    { id: translatorId },
  );
};

const hasTranslation = computed(() => {
  const { translations } = setting.value.downloadFormat;
  return translations.some((t) => (volume[t] ?? 0) > 0);
});

const file = computed(() => {
  const { mode, translationsMode, translations } = setting.value.downloadFormat;

  const { url, filename } = WenkuNovelApi.createFileUrl({
    novelId,
    volumeId: volume.volumeId,
    mode,
    translationsMode,
    translations,
  });
  return { url, filename };
});

const shouldTopJob = useShouldTopJob();
const submitJob = (id: 'gpt' | 'sakura') => {
  const task = TranslateTaskDescriptor.wenku(
    novelId,
    volume.volumeId,
    getParams(),
  );
  const workspace = useWorkspaceStore(id);
  const job = {
    task,
    description: volume.volumeId,
    createAt: Date.now(),
  };
  const success = workspace.addJob(job);
  if (success) {
    Toast.success('排队成功');
    if (shouldTopJob.value) {
      workspace.topJob(job);
    }
  } else {
    Toast.error('排队失败：翻译任务已经存在');
  }
};
</script>

<template>
  <div class="flex justify-between items-center gap-x-3">
    <div class="flex flex-col gap-1">
      <span class="text-ink">{{ volume.volumeId }}</span>

      <span class="text-muted">
        总计 {{ volume.total }} / 有道 {{ volume.youdao }} / GPT
        {{ volume.gpt }} / Sakura {{ volume.sakura }}
      </span>

      <div class="flex flex-wrap gap-2">
        <ActionButton
          v-if="setting.enabledTranslator.includes('youdao')"
          size="xs"
          variant="soft"
          :action="() => startTranslateTask('youdao')"
        >
          更新有道
        </ActionButton>

        <ActionButton
          v-if="setting.enabledTranslator.includes('gpt')"
          size="xs"
          variant="soft"
          :action="() => submitJob('gpt')"
        >
          排队GPT
        </ActionButton>
        <ActionButton
          v-if="setting.enabledTranslator.includes('sakura')"
          size="xs"
          variant="soft"
          :action="() => submitJob('sakura')"
        >
          排队Sakura
        </ActionButton>
        <ConfirmActionButton
          v-if="whoami.asAdmin"
          :hint="`真的要删除《${volume.volumeId}》吗？`"
          color="error"
          size="xs"
          variant="soft"
          label="删除"
          :action="() => emit('delete')"
        />
      </div>
    </div>

    <UButton
      :icon="FileDownloadOutlined"
      color="neutral"
      variant="outline"
      :href="hasTranslation ? file.url : undefined"
      :download="file.filename"
      target="_blank"
    >
      下载
    </UButton>
  </div>

  <TranslateTask
    ref="translateTask"
    @update:youdao="(zh) => (volume.youdao = zh)"
    @update:sakura="(zh) => (volume.sakura = zh)"
    class="mt-5"
  />
</template>
