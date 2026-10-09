<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';

import { GenericNovelId } from '@/model/Common';

import { useBookshelfLocalStore } from '@/pages/bookshelf/BookshelfLocalStore';
import { doAction } from '@/pages/util';
import { Humanize } from '@/util';

defineEmits<{
  volumeLoaded: [string];
}>();

const message = useMessage();

const themeVars = useThemeVars();

const store = useBookshelfLocalStore();

const confirmingVolumeId = ref<string>();

const deleteVolume = (volumeId: string) =>
  doAction(store.deleteVolume(volumeId), '删除', message);

const confirmDelete = (volumeId: string) => {
  confirmingVolumeId.value = undefined;
  deleteVolume(volumeId);
};
</script>

<template>
  <local-volume-list>
    <template #volume="volume">
      <div class="volume-row" :style="{ '--ci-danger': themeVars.errorColor }">
        <div class="volume-row__title">{{ volume.id }}</div>

        <div class="volume-row__meta" :style="{ color: themeVars.textColor3 }">
          {{ Humanize.relativeTime(volume.createAt) }} / 总计
          {{ volume.toc.length }}
        </div>

        <div class="volume-row__actions">
          <c-button-lite
            label="载入"
            @action="$emit('volumeLoaded', volume.id)"
          />

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
