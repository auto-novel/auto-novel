<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';
import { useKeyModifier } from '@vueuse/core';

import { GenericNovelId } from '@/model/Common';
import type { LocalVolumeMetadata } from '@/model/LocalVolume';
import { useBookshelfLocalStore } from '@/pages/bookshelf/BookshelfLocalStore';
import { doAction } from '@/pages/util';
import { Setting, useLocalVolumeStore, useSettingStore } from '@/stores';
import { downloadFile, Humanize } from '@/util';

const translateOptions = useTemplateRef('translateOptions');

const props = defineProps<{
  type: 'gpt' | 'sakura';
}>();

const message = useMessage();

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const store = useBookshelfLocalStore();

const themeVars = useThemeVars();

const confirmingVolumeId = ref<string>();

const deleteVolume = (volumeId: string) =>
  doAction(store.deleteVolume(volumeId), '删除', message);

const confirmDelete = (volumeId: string) => {
  confirmingVolumeId.value = undefined;
  deleteVolume(volumeId);
};

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
      <div class="volume-row" :style="{ '--ci-danger': themeVars.errorColor }">
        <div class="volume-row__title">{{ volume.id }}</div>

        <div class="volume-row__meta" :style="{ color: themeVars.textColor3 }">
          {{ Humanize.relativeTime(volume.createAt) }}
          / 总计 {{ volume.toc.length }} / 完成
          {{ calculateFinished(volume) }} / 过期
          {{ calculateExpired(volume) }}
        </div>

        <div class="volume-row__actions">
          <c-button-lite
            label="排队"
            @action="queueVolume(volume.id, volume.toc.length)"
          />

          <router-link
            v-if="!volume.id.endsWith('.epub')"
            :to="`/workspace/reader/${encodeURIComponent(volume.id)}/0`"
            target="_blank"
          >
            <c-button-lite label="阅读" />
          </router-link>

          <c-button-lite label="下载" @action="downloadVolume(volume.id)" />

          <glossary-button
            lite
            :gnid="GenericNovelId.local(volume.id)"
            :value="volume.glossary"
          />

          <div style="flex: 1" />

          <c-icon-button-lite
            tooltip="删除"
            type="error"
            :icon="DeleteOutlineOutlined"
            @action="confirmingVolumeId = volume.id"
          />

          <div
            v-if="confirmingVolumeId === volume.id"
            class="volume-row__confirm"
            :style="{
              borderColor: themeVars.borderColor,
              background: themeVars.cardColor,
            }"
          >
            <span class="volume-row__confirm-hint">
              真的要删除《{{ volume.id }}》吗？
            </span>
            <c-button-lite
              label="确认"
              type="error"
              @action="confirmDelete(volume.id)"
            />
            <c-button-lite
              label="取消"
              @action="confirmingVolumeId = undefined"
            />
          </div>
        </div>
      </div>
    </template>
  </local-volume-list>
</template>

<style scoped>
.volume-row {
  position: relative;
}
.volume-row__title {
  font-size: 14px;
  overflow-wrap: break-word;
  word-break: break-word;
}
.volume-row__meta {
  margin-top: 4px;
  font-size: 12px;
}
.volume-row__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.volume-row__actions a {
  color: inherit;
  text-decoration: none;
}
.volume-row__confirm {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
.volume-row__confirm-hint {
  max-width: 260px;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
