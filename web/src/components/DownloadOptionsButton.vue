<script lang="ts" setup>
import { useIsWideScreen } from '@/pages/util';
import { Setting, useSettingStore } from '@/stores';

withDefaults(
  defineProps<{
    showFileType?: boolean;
    showFilenameType?: boolean;
  }>(),
  {
    showFileType: false,
    showFilenameType: false,
  },
);

defineOptions({ inheritAttrs: false });

const isWideScreen = useIsWideScreen(600);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const showDownloadModal = ref(false);
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    v-bind="$attrs"
    @click="showDownloadModal = true"
  >
    下载设置
  </UButton>

  <UModal
    title="下载设置"
    v-model:open="showDownloadModal"
    class="w-150"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
  >
    <template #body>
      <div class="flex flex-col gap-y-3">
        <c-action-wrapper title="语言">
          <URadioGroup
            orientation="horizontal"
            variant="table"
            indicator="hidden"
            :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
            v-model="setting.downloadFormat.mode"
            :items="Setting.downloadModeOptions"
          />
        </c-action-wrapper>

        <c-action-wrapper title="翻译">
          <div class="flex flex-wrap gap-x-3 gap-y-2">
            <URadioGroup
              orientation="horizontal"
              variant="table"
              indicator="hidden"
              :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
              v-model="setting.downloadFormat.translationsMode"
              :items="Setting.downloadTranslationModeOptions"
            />
            <translator-check
              v-model:value="setting.downloadFormat.translations"
              show-order
              :two-line="!isWideScreen"
            />
          </div>
        </c-action-wrapper>

        <c-action-wrapper v-if="showFileType" title="文件">
          <URadioGroup
            orientation="horizontal"
            variant="table"
            indicator="hidden"
            :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
            v-model="setting.downloadFormat.type"
            :items="Setting.downloadTypeOptions"
          />
        </c-action-wrapper>

        <c-action-wrapper
          v-if="showFilenameType"
          title="中文文件名"
          align="center"
        >
          <USwitch
            aria-label="中文文件名"
            :model-value="setting.downloadFilenameType === 'zh'"
            @update:model-value="
              (it: boolean) => (setting.downloadFilenameType = it ? 'zh' : 'jp')
            "
          />
        </c-action-wrapper>

        <span class="text-muted text-[12px]">
          # 某些EPUB阅读器无法正确显示日文段落的浅色字体
        </span>
      </div>
    </template>
  </UModal>
</template>
