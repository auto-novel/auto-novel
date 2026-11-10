<script lang="ts" setup>
import { XDialog, XSwitch } from '@novelia/web-kit';

import { useIsWideScreen } from '@/pages/util';
import { Setting, useSettingStore } from '@/stores';

withDefaults(
  defineProps<{
    round?: boolean;
    size?: 'tiny' | 'small' | 'medium' | 'large';
    showFileType?: boolean;
    showFilenameType?: boolean;
  }>(),
  {
    round: true,
    size: 'medium',
    showFileType: false,
    showFilenameType: false,
  },
);

const isWideScreen = useIsWideScreen(600);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const showDownloadModal = ref(false);
</script>

<template>
  <c-button
    label="下载设置"
    :round="round"
    :size="size"
    @action="showDownloadModal = true"
  />

  <XDialog title="下载设置" v-model:open="showDownloadModal" class="w-[600px]">
    <div class="flex flex-col flex-nowrap justify-start gap-x-4 gap-y-3">
      <c-action-wrapper title="语言">
        <c-radio-group
          v-model:value="setting.downloadFormat.mode"
          :options="Setting.downloadModeOptions"
        />
      </c-action-wrapper>

      <c-action-wrapper title="翻译">
        <div class="flex flex-wrap justify-start gap-x-3 gap-y-2">
          <c-radio-group
            v-model:value="setting.downloadFormat.translationsMode"
            :options="Setting.downloadTranslationModeOptions"
          />
          <translator-check
            v-model:value="setting.downloadFormat.translations"
            show-order
            :two-line="!isWideScreen"
          />
        </div>
      </c-action-wrapper>

      <c-action-wrapper v-if="showFileType" title="文件">
        <c-radio-group
          v-model:value="setting.downloadFormat.type"
          :options="Setting.downloadTypeOptions"
        />
      </c-action-wrapper>

      <c-action-wrapper
        v-if="showFilenameType"
        title="中文文件名"
        align="center"
      >
        <XSwitch
          aria-label="中文文件名"
          :model-value="setting.downloadFilenameType === 'zh'"
          @update:model-value="
            (it: boolean) => (setting.downloadFilenameType = it ? 'zh' : 'jp')
          "
        />
      </c-action-wrapper>

      <n-text depth="3" style="font-size: 12px">
        # 某些EPUB阅读器无法正确显示日文段落的浅色字体
      </n-text>
    </div>
  </XDialog>
</template>
