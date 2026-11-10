<script lang="ts" setup>
import { useId } from 'vue';

import { useIsWideScreen } from '@/pages/util';
import { ReaderSetting, useReaderSettingStore } from '@/stores';
import { checkIsMobile } from '@/util';
import { AddOutlined, MinusOutlined } from '@vicons/material';
import { XDialog, XSwitch, XSeparator } from '@novelia/web-kit';

const open = defineModel<boolean>('open', { default: false });
const popupTargetId = useId();
const isMobile = checkIsMobile();
const isWideScreen = useIsWideScreen(600);

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const setIndentSize = (diff: number) => {
  readerSetting.value.indentSize = Math.min(
    Math.max(readerSetting.value.indentSize! + diff, 0),
    9,
  );
};
</script>

<template>
  <XDialog
    v-model:open="open"
    aria-label="阅读设置"
    class="w-[600px]"
    :scrollable="false"
    :ui="{ body: 'p-0' }"
    style="overflow: visible"
  >
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- 表单内置浮层放在弹窗内、滚动区外，避免跨库模态隔离和滚动裁剪。 -->
      <div :id="popupTargetId" class="shrink-0" />
      <div class="min-h-0 flex-1 overflow-y-auto" style="max-height: 80dvh">
        <n-tabs
          type="line"
          size="large"
          :tabs-padding="20"
          pane-style="padding: 0px;"
          animated
          style="width: 100%"
        >
          <n-tab-pane name="signin" tab="内容">
            <div
              class="box-border flex w-full flex-col flex-nowrap justify-start gap-x-4 gap-y-3 p-5"
            >
              <c-action-wrapper title="语言">
                <c-radio-group
                  v-model:value="readerSetting.mode"
                  :options="ReaderSetting.modeOptions"
                />
              </c-action-wrapper>

              <c-action-wrapper title="翻译">
                <div class="flex flex-wrap justify-start gap-x-4 gap-y-3">
                  <c-radio-group
                    v-model:value="readerSetting.translationsMode"
                    :options="ReaderSetting.translationModeOptions"
                  />
                  <translator-check
                    v-model:value="readerSetting.translations"
                    show-order
                    :two-line="!isWideScreen"
                  />
                </div>
              </c-action-wrapper>

              <c-action-wrapper v-if="isMobile" title="点按区域">
                <c-radio-group
                  v-model:value="readerSetting.clickArea"
                  :options="ReaderSetting.clickAreaOptions"
                />
              </c-action-wrapper>

              <c-action-wrapper title="朗读语言">
                <c-radio-group
                  :value="readerSetting.speakLanguages[0]"
                  @update-value="
                    (it: any) => (readerSetting.speakLanguages = [it])
                  "
                  :options="ReaderSetting.speakLanguagesOptions"
                />
              </c-action-wrapper>
              <c-action-wrapper title="翻页模式">
                <c-radio-group
                  :value="readerSetting.pageTurnMode"
                  @update-value="(it: any) => (readerSetting.pageTurnMode = it)"
                  :options="ReaderSetting.pageTurnModeOptions"
                />
              </c-action-wrapper>
              <c-action-wrapper v-if="isMobile" title="点按动画" align="center">
                <XSwitch
                  v-model="readerSetting.enableClickAnimition"
                  aria-label="点按动画"
                />
              </c-action-wrapper>
              <c-action-wrapper title="显示翻译来源" align="center">
                <XSwitch
                  v-model="readerSetting.enableSourceLabel"
                  aria-label="显示翻译来源"
                />
              </c-action-wrapper>
              <c-action-wrapper title="折叠插图" align="center">
                <XSwitch
                  v-model="readerSetting.foldImages"
                  aria-label="折叠插图"
                />
              </c-action-wrapper>
              <c-action-wrapper title="缩进修正" align="center">
                <div
                  class="flex flex-wrap justify-start items-center gap-x-4 gap-y-3"
                >
                  <XSwitch
                    :model-value="readerSetting.indentSize !== undefined"
                    @update:model-value="
                      (enabled: boolean) =>
                        (readerSetting.indentSize = enabled ? 2 : undefined)
                    "
                    aria-label="缩进修正"
                  />
                  <c-action-wrapper
                    v-if="readerSetting.indentSize !== undefined"
                    title="缩进值"
                    align="center"
                  >
                    <n-input-group>
                      <n-button size="small" @click="setIndentSize(-1)">
                        <template #icon>
                          <n-icon><MinusOutlined /></n-icon>
                        </template>
                      </n-button>
                      <n-input
                        :value="readerSetting.indentSize + ' 字符'"
                        size="small"
                        style="text-align: center; width: 70px"
                        readonly
                      />
                      <n-button size="small" @click="setIndentSize(1)">
                        <template #icon>
                          <n-icon><AddOutlined /></n-icon>
                        </template>
                      </n-button>
                    </n-input-group>
                  </c-action-wrapper>
                </div>
              </c-action-wrapper>

              <n-text depth="3" style="font-size: 12px">
                # 左/右方向键跳转章节，数字键1～3切换翻译
              </n-text>
            </div>
          </n-tab-pane>

          <n-tab-pane name="signup" tab="样式">
            <div
              class="flex w-full flex-col flex-nowrap justify-start gap-x-4 gap-y-3 p-5"
            >
              <c-action-wrapper title="字重">
                <c-radio-group
                  v-model:value="readerSetting.fontWeight"
                  :options="ReaderSetting.fontWeightOptions"
                />
              </c-action-wrapper>

              <c-action-wrapper title="字号" align="center">
                <n-slider
                  :to="`#${popupTargetId}`"
                  v-model:value="readerSetting.fontSize"
                  :min="14"
                  :max="40"
                  style="flex: auto"
                  :format-tooltip="(value: number) => `${value}px`"
                />
                <n-text style="width: 6em">
                  {{ readerSetting.fontSize }}px
                </n-text>
              </c-action-wrapper>

              <c-action-wrapper title="行距" align="center">
                <n-slider
                  :to="`#${popupTargetId}`"
                  v-model:value="readerSetting.lineSpace"
                  :step="0.1"
                  :min="0"
                  :max="2"
                  style="flex: auto"
                  :format-tooltip="(value: number) => value.toFixed(1)"
                />
                <n-text style="width: 6em">
                  {{ readerSetting.lineSpace.toFixed(1) }}
                </n-text>
              </c-action-wrapper>

              <c-action-wrapper title="页宽" align="center">
                <n-slider
                  :to="`#${popupTargetId}`"
                  v-model:value="readerSetting.pageWidth"
                  :step="50"
                  :min="600"
                  :max="1200"
                  style="flex: auto"
                  :format-tooltip="(value: number) => `${value}px`"
                />
                <n-text style="width: 6em">
                  {{ readerSetting.pageWidth }}px
                </n-text>
              </c-action-wrapper>

              <c-action-wrapper title="下划线">
                <c-radio-group
                  v-model:value="readerSetting.textUnderline"
                  :options="ReaderSetting.textUnderlineOptions"
                />
              </c-action-wrapper>

              <c-action-wrapper title="主题">
                <div
                  class="flex flex-col flex-nowrap justify-start gap-x-4 gap-y-3"
                >
                  <c-radio-group
                    v-model:value="readerSetting.theme.mode"
                    :options="ReaderSetting.themeModeOptions"
                  />
                  <template v-if="readerSetting.theme.mode === 'custom'">
                    <div class="flex flex-wrap justify-start gap-x-3 gap-y-2">
                      <n-radio
                        v-for="theme of ReaderSetting.themeOptions"
                        :key="theme.bodyColor"
                        :checked="
                          theme.bodyColor == readerSetting.theme.bodyColor
                        "
                        @update:checked="
                          readerSetting.theme = { mode: 'custom', ...theme }
                        "
                      >
                        <n-tag
                          :color="{
                            color: theme.bodyColor,
                            textColor: theme.fontColor,
                          }"
                          :style="{
                            width: isWideScreen ? '5.5em' : '2em',
                          }"
                        >
                          {{ isWideScreen ? theme.bodyColor : '#' }}
                        </n-tag>
                      </n-radio>
                    </div>
                    <XSeparator style="margin: 0px" />
                    <div class="flex flex-wrap justify-start gap-x-3 gap-y-2">
                      <n-color-picker
                        :to="`#${popupTargetId}`"
                        :modes="['hex']"
                        :show-alpha="false"
                        v-model:value="readerSetting.theme.bodyColor"
                        style="width: 8.2em"
                      >
                        <template #label="color">背景：{{ color }}</template>
                      </n-color-picker>
                      <n-color-picker
                        :to="`#${popupTargetId}`"
                        :modes="['hex']"
                        :show-alpha="false"
                        v-model:value="readerSetting.theme.fontColor"
                        style="width: 8.2em"
                      >
                        <template #label="color">文字：{{ color }}</template>
                      </n-color-picker>
                    </div>
                  </template>
                </div>
              </c-action-wrapper>

              <c-action-wrapper title="主透明度" align="center">
                <n-slider
                  :to="`#${popupTargetId}`"
                  v-model:value="readerSetting.mixZhOpacity"
                  :max="1"
                  :min="0"
                  :step="0.05"
                  :format-tooltip="
                    (value: number) => `${(value * 100).toFixed(0)}%`
                  "
                  style="flex: auto"
                />
                <n-text style="width: 6em">
                  {{ (readerSetting.mixZhOpacity * 100).toFixed(0) }}%
                </n-text>
              </c-action-wrapper>

              <c-action-wrapper title="辅透明度" align="center">
                <n-slider
                  :to="`#${popupTargetId}`"
                  v-model:value="readerSetting.mixJpOpacity"
                  :max="1"
                  :min="0"
                  :step="0.05"
                  :format-tooltip="
                    (value: number) => `${(value * 100).toFixed(0)}%`
                  "
                />
                <n-text style="width: 6em">
                  {{ (readerSetting.mixJpOpacity * 100).toFixed(0) }}%
                </n-text>
              </c-action-wrapper>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </XDialog>
</template>
