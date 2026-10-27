<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import { DeleteOutlineOutlined } from '@vicons/material';
import LocalVolumeDrawer from './LocalVolumeDrawer.vue';

import { GenericNovelId } from '@/model/Common';

import { useBookshelfLocalStore } from '@/pages/bookshelf/BookshelfLocalStore';

defineEmits<{
  volumeLoaded: [string];
}>();

const store = useBookshelfLocalStore();

const deleteVolume = (volumeId: string) =>
  Toast.promise(store.deleteVolume(volumeId), {
    success: '删除成功',
    error: '删除失败',
  });
</script>

<template>
  <local-volume-drawer>
    <template #volume="volume">
      <n-flex :size="4" vertical>
        <n-text>{{ volume.id }}</n-text>

        <n-text depth="3">
          <n-time :time="volume.createAt" type="relative" />
          / 总计
          {{ volume.toc.length }}
        </n-text>

        <n-flex :size="8">
          <c-button
            label="载入"
            size="tiny"
            secondary
            @action="$emit('volumeLoaded', volume.id)"
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
  </local-volume-drawer>
</template>
