<script lang="ts" setup>
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

  <c-modal title="下载设置" v-model:show="showDownloadModal">
    <n-flex vertical size="large">
      <c-action-wrapper title="语言">
        <c-radio-group
          v-model:value="setting.downloadFormat.mode"
          :options="Setting.downloadModeOptions"
        />
      </c-action-wrapper>

      <c-action-wrapper title="翻译">
        <n-flex>
          <c-radio-group
            v-model:value="setting.downloadFormat.translationsMode"
            :options="Setting.downloadTranslationModeOptions"
          />
          <translator-check
            v-model:value="setting.downloadFormat.translations"
            show-order
            :two-line="!isWideScreen"
          />
        </n-flex>
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
        <n-switch
          size="small"
          :value="setting.downloadFilenameType === 'zh'"
          @update-value="
            (it: boolean) => (setting.downloadFilenameType = it ? 'zh' : 'jp')
          "
        />
      </c-action-wrapper>

      <n-text depth="3" style="font-size: 12px">
        # 某些EPUB阅读器无法正确显示日文段落的浅色字体
      </n-text>
    </n-flex>
  </c-modal>
</template>
