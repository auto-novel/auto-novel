<script lang="ts" setup>
import { Toast, getApiErrorMessage, XTime } from '@novelia/web-kit';
import { DeleteOutlineOutlined } from '@vicons/material';
import LocalVolumeDrawer from './LocalVolumeDrawer.vue';

import { GenericNovelId } from '@/model/Common';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import { useBookshelfLocalStore } from '@/pages/bookshelf/BookshelfLocalStore';
import {
  Setting,
  summarizeQueueResults,
  useLocalVolumeStore,
  useSettingStore,
} from '@/stores';
import { downloadFile, useShouldTopJob } from '@/util';

const translateOptions = useTemplateRef('translateOptions');

const props = defineProps<{
  type: 'gpt' | 'sakura';
}>();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();

const deleteVolume = (volumeId: string) =>
  Toast.promise(store.deleteVolume(volumeId), {
    success: '删除成功',
    error: (reason) => getApiErrorMessage(reason, '删除失败'),
  }).catch(() => {});

const calculateFinished = (volume: LocalVolumeMetadata) =>
  volume.toc.filter((it) => {
    let chapterGlossaryId: string | undefined;
    if (props.type === 'gpt') {
      chapterGlossaryId = it.gpt;
    } else {
      chapterGlossaryId = it.sakura;
    }
    return chapterGlossaryId === volume.glossaryId;
  }).length;

const calculateExpired = (volume: LocalVolumeMetadata) =>
  volume.toc.filter((it) => {
    let chapterGlossaryId: string | undefined;
    if (props.type === 'gpt') {
      chapterGlossaryId = it.gpt;
    } else {
      chapterGlossaryId = it.sakura;
    }
    return (
      chapterGlossaryId !== undefined && chapterGlossaryId !== volume.glossaryId
    );
  }).length;

const queueAllVolumes = (volumes: LocalVolumeMetadata[]) => {
  const ids = volumes.map((it) => it.id);
  const { success, failed } = store.queueJobsToWorkspace(ids, {
    level: 'expire',
    type: props.type,
    shouldTop: shouldTopJob.value ?? false,
  });
  Toast.info(`${success}本小说已排队，${failed}本失败`);
};

const shouldTopJob = useShouldTopJob();
const queueVolume = (volumeId: string) => {
  const { startIndex, endIndex, level } =
    translateOptions.value!.getTranslateTaskParams();
  const results = store.queueJobToWorkspace(volumeId, {
    level: level,
    type: props.type,
    shouldTop: shouldTopJob.value ?? false,
    startIndex: startIndex,
    endIndex: endIndex,
  });
  const { type, text } = summarizeQueueResults(results);
  Toast[type](text);
};

const downloadVolume = async (volumeId: string) => {
  const { mode } = setting.value.downloadFormat;
  const repo = await useLocalVolumeStore();

  await Toast.promise(
    repo.getTranslationFile({
      id: volumeId,
      mode,
      translationsMode: 'priority',
      translations: [props.type],
    }),
    { error: (reason) => getApiErrorMessage(reason, '文件生成错误') },
  )
    .then(({ filename, blob }) => {
      downloadFile(filename, blob);
    })
    .catch(() => {});
};

const progressFilter = ref<'all' | 'finished' | 'unfinished'>('all');
const progressFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'finished', label: '已完成' },
  { value: 'unfinished', label: '未完成' },
];
const progressFilterFunc = computed(() => {
  if (progressFilter.value === 'finished') {
    return (volume: LocalVolumeMetadata) => {
      return volume.toc.length === calculateFinished(volume);
    };
  } else if (progressFilter.value === 'unfinished') {
    return (volume: LocalVolumeMetadata) => {
      return volume.toc.length !== calculateFinished(volume);
    };
  } else {
    return undefined;
  }
});
</script>

<template>
  <local-volume-drawer
    :filter="progressFilterFunc"
    :options="{ 全部排队: queueAllVolumes }"
    @volume-add="queueVolume($event.name)"
  >
    <template #extra>
      <TranslateOptions
        ref="translateOptions"
        :gnid="GenericNovelId.local('')"
        :glossary="{}"
      />
      <USeparator style="margin: 12px 0" />
      <c-action-wrapper title="状态">
        <c-radio-group
          v-model:value="progressFilter"
          :options="progressFilterOptions"
          size="small"
        />
      </c-action-wrapper>

      <c-action-wrapper title="语言">
        <c-radio-group
          v-model:value="setting.downloadFormat.mode"
          :options="Setting.downloadModeOptions"
          size="small"
        />
      </c-action-wrapper>
    </template>

    <template #volume="volume">
      <div class="flex flex-col flex-nowrap justify-start gap-1">
        <n-text>{{ volume.id }}</n-text>

        <n-text depth="3">
          <XTime :time="volume.createAt" preset="relative" />
          / 总计 {{ volume.toc.length }} / 完成
          {{ calculateFinished(volume) }} / 过期
          {{ calculateExpired(volume) }}
        </n-text>

        <div class="flex flex-wrap justify-start gap-2">
          <ActionButton
            size="xs"
            variant="soft"
            :action="() => queueVolume(volume.id)"
          >
            排队
          </ActionButton>

          <UButton
            v-if="!volume.id.endsWith('.epub')"
            :to="`/workspace/reader/${encodeURIComponent(volume.id)}/0`"
            target="_blank"
            color="neutral"
            size="xs"
            variant="soft"
            class="rounded-full"
          >
            阅读
          </UButton>

          <ActionButton
            size="xs"
            variant="soft"
            :action="() => downloadVolume(volume.id)"
          >
            下载
          </ActionButton>

          <glossary-button
            :gnid="GenericNovelId.local(volume.id)"
            :value="volume.glossary"
            size="xs"
            variant="soft"
          />

          <div style="flex: 1" />

          <ConfirmActionButton
            aria-label="删除"
            :hint="`真的要删除《${volume.id}》吗？`"
            size="xs"
            color="error"
            variant="soft"
            :icon="DeleteOutlineOutlined"
            square
            :action="() => deleteVolume(volume.id)"
          />
        </div>
      </div>
    </template>
  </local-volume-drawer>
</template>
