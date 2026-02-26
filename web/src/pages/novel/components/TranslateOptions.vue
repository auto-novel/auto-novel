<script lang="ts" setup>
import { InfoOutlined } from '@vicons/material';

import type { GenericNovelId } from '@/model/Common';
import type { Glossary } from '@/model/Glossary';
import type { TranslateTaskParams } from '@/model/Translator';
import { useIsWideScreen } from '@/pages/util';
import { Setting, useSettingStore } from '@/stores';

const probs = defineProps<{
  gnid: GenericNovelId;
  glossary: Glossary;
}>();
const isWideScreen = useIsWideScreen(600);

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

// 翻译设置
const translateLevel = ref<'normal' | 'expire' | 'all' | 'sync'>(
  probs.gnid.type === 'local' ? 'expire' : 'normal',
);
const forceMetadata = ref(false);
const startIndex = ref<number | null>(0);
const endIndex = ref<number | null>(65536);
const taskNumber = ref<number | null>(1);

defineExpose({
  getTranslateTaskParams: (): TranslateTaskParams => ({
    level: translateLevel.value,
    forceMetadata: forceMetadata.value,
    startIndex: startIndex.value ?? 0,
    endIndex: endIndex.value ?? 65536,
  }),
  getTaskNumber: () => taskNumber.value ?? 1,
});

const showDownloadModal = ref(false);
</script>

<template>
  <n-flex vertical>
    <c-action-wrapper title="选项">
      <n-flex size="small">
        <n-tooltip trigger="hover" style="max-width: 200px">
          <template #trigger>
            <n-flex :size="0" :wrap="false">
              <tag-button
                label="常规"
                :checked="translateLevel === 'normal'"
                @update:checked="translateLevel = 'normal'"
              />
              <tag-button
                label="过期"
                :checked="translateLevel === 'expire'"
                @update:checked="translateLevel = 'expire'"
              />
              <tag-button
                label="重翻"
                type="warning"
                :checked="translateLevel === 'all'"
                @update:checked="translateLevel = 'all'"
              />
              <tag-button
                v-if="gnid.type === 'web'"
                label="源站同步"
                type="warning"
                :checked="translateLevel === 'sync'"
                @update:checked="translateLevel = 'sync'"
              />
            </n-flex>
          </template>
          常规：只翻译未翻译的章节
          <br />
          过期：翻译术语表过期的章节
          <br />
          重翻：重翻全部章节
          <br />
          <template v-if="gnid.type === 'web'">
            源站同步：用于原作者修改了原文的情况导致不一致的情况，可能清空现有翻译，慎用！!
          </template>
        </n-tooltip>

        <tag-button
          v-if="gnid.type === 'web'"
          label="重翻目录"
          v-model:checked="forceMetadata"
        />

        <n-text
          v-if="translateLevel === 'all' || translateLevel === 'sync'"
          type="warning"
          style="font-size: 12px; flex-basis: 100%"
        >
          <b>* 请确保你知道自己在干啥，不要随便使用危险功能</b>
        </n-text>
      </n-flex>
    </c-action-wrapper>

    <c-action-wrapper
      v-if="gnid.type === 'web' || gnid.type === 'local'"
      title="范围"
    >
      <n-flex style="text-align: center">
        <div>
          <n-input-group>
            <n-input-group-label size="small">从</n-input-group-label>
            <n-input-number
              size="small"
              v-model:value="startIndex"
              :show-button="false"
              button-placement="both"
              :min="0"
              style="width: 60px"
            />
            <n-input-group-label size="small">到</n-input-group-label>
            <n-input-number
              size="small"
              v-model:value="endIndex"
              :show-button="false"
              :min="0"
              style="width: 60px"
            />
          </n-input-group>
        </div>
        <div>
          <n-input-group>
            <n-input-group-label size="small">均分</n-input-group-label>
            <n-input-number
              size="small"
              v-model:value="taskNumber"
              :show-button="false"
              :min="1"
              :max="gnid.type === 'local' ? 65536 : 10"
              style="width: 40px"
            />
            <n-input-group-label size="small">个任务</n-input-group-label>
          </n-input-group>
        </div>

        <n-tooltip trigger="hover" placement="top" style="max-width: 200px">
          <template #trigger>
            <n-button text>
              <n-icon depth="4" :component="InfoOutlined" />
            </n-button>
          </template>
          章节序号看下面目录方括号里的数字。“从0到10”表示从第0章到第9章，不包含第10章。均分任务只对排队生效，最大为10。
        </n-tooltip>
      </n-flex>
    </c-action-wrapper>

    <c-action-wrapper v-if="gnid.type !== 'local'" title="操作">
      <n-button-group size="small">
        <c-button
          label="下载设置"
          :round="false"
          @action="showDownloadModal = true"
        />
        <glossary-button :gnid="gnid" :value="glossary" :round="false" />
      </n-button-group>
    </c-action-wrapper>

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

        <c-action-wrapper v-if="gnid.type === 'web'" title="文件">
          <c-radio-group
            v-model:value="setting.downloadFormat.type"
            :options="Setting.downloadTypeOptions"
          />
        </c-action-wrapper>

        <c-action-wrapper
          title="使用半透明/浅色字体显示日文原文"
          v-if="gnid.type === 'web' && setting.downloadFormat.type == 'epub'"
        >
          <c-radio-group
            v-model:value="setting.downloadFormat.opacityOrColor"
            :options="Setting.epubOpacityOrColorOptions"
          />
        </c-action-wrapper>

        <c-action-wrapper
          v-if="gnid.type === 'web'"
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
  </n-flex>
</template>
