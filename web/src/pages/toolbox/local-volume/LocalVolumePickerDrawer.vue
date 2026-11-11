<script lang="ts" setup>
import { getApiErrorMessage, Toast, XTime } from '@novelia/web-kit';
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
    error: (reason) => getApiErrorMessage(reason, '删除失败'),
  }).catch(() => {});
</script>

<template>
  <local-volume-drawer>
    <template #volume="volume">
      <div class="flex flex-col flex-nowrap justify-start gap-1">
        <n-text>{{ volume.id }}</n-text>

        <n-text depth="3">
          <XTime :time="volume.createAt" preset="relative" />
          / 总计
          {{ volume.toc.length }}
        </n-text>

        <div class="flex flex-wrap justify-start gap-2">
          <UButton
            color="neutral"
            size="xs"
            variant="soft"
            class="rounded-full"
            @click="$emit('volumeLoaded', volume.id)"
          >
            载入
          </UButton>

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
