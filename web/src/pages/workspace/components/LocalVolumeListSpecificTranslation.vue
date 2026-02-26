<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';
import { useKeyModifier } from '@vueuse/core';

import { GenericNovelId } from '@/model/Common';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import { useBookshelfLocalStore } from '@/pages/bookshelf/BookshelfLocalStore';
import { doAction } from '@/pages/util';
import { Setting, useLocalVolumeStore, useSettingStore } from '@/stores';
import { downloadFile } from '@/util';

const translateOptions = useTemplateRef('translateOptions');

const props = defineProps<{
  type: 'gpt' | 'sakura' | 'murasaki';
}>();

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();

const deleteVolume = (volumeId: string) =>
  doAction(store.deleteVolume(volumeId), '删除', message);

const calculateFinished = (volume: LocalVolumeMetadata) =>
  volume.toc.filter((it) => {
    let chapterGlossaryId: string | undefined;
    if (props.type === 'gpt') {
      chapterGlossaryId = it.gpt;
    } else if (props.type === 'murasaki') {
      chapterGlossaryId = it.murasaki;
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
    } else if (props.type === 'murasaki') {
      chapterGlossaryId = it.murasaki;
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
  message.info(`${success}本小说已排队，${failed}本失败`);
};

const shouldTopJob = useKeyModifier('Control');
const queueVolume = (volumeId: string, total: number = 65536) => {
  const { startIndex, endIndex, level, forceMetadata } =
    translateOptions.value!.getTranslateTaskParams();
  const taskNumber = translateOptions.value!.getTaskNumber();
  const success = store.queueJobToWorkspace(volumeId, {
    level: level,
    type: props.type,
    shouldTop: shouldTopJob.value ?? false,
    startIndex: startIndex,
    endIndex: endIndex,
    taskNumber: taskNumber,
    total: total,
  });
  if (success) {
    message.success('排队成功');
  } else {
    message.error('排队失败：翻译任务已经存在');
  }
};

const downloadVolume = async (volumeId: string) => {
  const { mode } = setting.value.downloadFormat;
  const repo = await useLocalVolumeStore();

  try {
    const { filename, blob } = await repo.getTranslationFile({
      id: volumeId,
      mode,
      translationsMode: 'priority',
      translations: [props.type],
    });
    downloadFile(filename, blob);
  } catch (error) {
    message.error(`文件生成错误：${error}`);
  }
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
  <local-volume-list
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
      <n-divider style="margin: 12px 0" />
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
      <n-flex :size="4" vertical>
        <n-text>{{ volume.id }}</n-text>

        <n-text depth="3">
          <n-time :time="volume.createAt" type="relative" />
          / 总计 {{ volume.toc.length }} / 完成
          {{ calculateFinished(volume) }} / 过期
          {{ calculateExpired(volume) }}
        </n-text>

        <n-flex :size="8">
          <c-button
            label="排队"
            size="tiny"
            secondary
            @action="queueVolume(volume.id, volume.toc.length)"
          />

          <router-link
            v-if="!volume.id.endsWith('.epub')"
            :to="`/workspace/reader/${encodeURIComponent(volume.id)}/0`"
            target="_blank"
          >
            <c-button label="阅读" size="tiny" secondary />
          </router-link>

          <c-button
            label="下载"
            size="tiny"
            secondary
            @action="downloadVolume(volume.id)"
          />

          <glossary-button
            :gnid="GenericNovelId.local(volume.id)"
            :value="volume.glossary"
            size="tiny"
            secondary
          />

          <div style="flex: 1" />

          <c-button-confirm
            :hint="`真的要删除《${volume.id}》吗？`"
            :icon="DeleteOutlineOutlined"
            size="tiny"
            secondary
            circle
            type="error"
            @action="deleteVolume(volume.id)"
          />
        </n-flex>
      </n-flex>
    </template>
  </local-volume-list>
</template>
