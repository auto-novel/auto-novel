<script lang="ts" setup>
import { checkIsMobile, useIsWideScreen } from '@/pages/util';
import { ReaderSetting, useReaderSettingStore } from '@/stores';

const isMobile = checkIsMobile();
const isWideScreen = useIsWideScreen(600);

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const setCustomBodyColor = (color: string) =>
  (readerSetting.value.theme.bodyColor = color);
const setCustomFontColor = (color: string) =>
  (readerSetting.value.theme.fontColor = color);
</script>

<template>
  <c-modal content-style="padding: 0;" :max-height-percentage="80">
    <n-tabs
      type="line"
      size="large"
      :tabs-padding="20"
      pane-style="padding: 0px;"
      animated
      style="width: 100%"
    >
      <n-tab-pane name="signin" tab="内容">
        <n-flex vertical size="large" style="width: 100%; padding: 20px">
          <c-action-wrapper title="语言">
            <c-radio-group
              v-model:value="readerSetting.mode"
              :options="ReaderSetting.modeOptions"
            />
          </c-action-wrapper>

          <c-action-wrapper title="翻译">
            <n-flex size="large">
              <c-radio-group
                v-model:value="readerSetting.translationsMode"
                :options="ReaderSetting.translationModeOptions"
              />
              <translator-check
                v-model:value="readerSetting.translations"
                show-order
                :two-line="!isWideScreen"
              />
            </n-flex>
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
              @update-value="(it: any) => (readerSetting.speakLanguages = [it])"
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
            <n-switch
              v-model:value="readerSetting.enableClickAnimition"
              size="small"
            />
          </c-action-wrapper>
          <c-action-wrapper title="显示翻译来源" align="center">
            <n-switch
              v-model:value="readerSetting.enableSourceLabel"
              size="small"
            />
          </c-action-wrapper>
          <c-action-wrapper title="去除缩进" align="center">
            <n-switch
              v-model:value="readerSetting.trimLeadingSpaces"
              size="small"
            />
          </c-action-wrapper>

          <n-text depth="3" style="font-size: 12px">
            # 左/右方向键跳转章节，数字键1～4切换翻译
          </n-text>
        </n-flex>
      </n-tab-pane>

      <n-tab-pane name="signup" tab="样式">
        <n-flex vertical size="large" style="width: 100%; padding: 20px">
          <c-action-wrapper title="字重">
            <c-radio-group
              v-model:value="readerSetting.fontWeight"
              :options="ReaderSetting.fontWeightOptions"
            />
          </c-action-wrapper>

          <c-action-wrapper title="字号" align="center">
            <n-slider
              v-model:value="readerSetting.fontSize"
              :min="14"
              :max="40"
              style="flex: auto"
              :format-tooltip="(value: number) => `${value}px`"
            />
            <n-text style="width: 6em">{{ readerSetting.fontSize }}px</n-text>
          </c-action-wrapper>

          <c-action-wrapper title="行距" align="center">
            <n-slider
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
              v-model:value="readerSetting.pageWidth"
              :step="50"
              :min="600"
              :max="1200"
              style="flex: auto"
              :format-tooltip="(value: number) => `${value}px`"
            />
            <n-text style="width: 6em">{{ readerSetting.pageWidth }}px</n-text>
          </c-action-wrapper>

          <c-action-wrapper title="下划线">
            <c-radio-group
              v-model:value="readerSetting.textUnderline"
              :options="ReaderSetting.textUnderlineOptions"
            />
          </c-action-wrapper>

          <c-action-wrapper title="主题">
            <n-flex size="large" vertical>
              <c-radio-group
                v-model:value="readerSetting.theme.mode"
                :options="ReaderSetting.themeModeOptions"
              />
              <template v-if="readerSetting.theme.mode === 'custom'">
                <n-flex>
                  <n-radio
                    v-for="theme of ReaderSetting.themeOptions"
                    :key="theme.bodyColor"
                    :checked="theme.bodyColor == readerSetting.theme.bodyColor"
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
                </n-flex>
                <n-divider style="margin: 0px" />
                <n-flex>
                  <n-color-picker
                    :modes="['hex']"
                    :show-alpha="false"
                    :default-value="readerSetting.theme.bodyColor"
                    :on-complete="setCustomBodyColor"
                    style="width: 8.2em"
                  >
                    <template #label="color">背景：{{ color }}</template>
                  </n-color-picker>
                  <n-color-picker
                    :modes="['hex']"
                    :show-alpha="false"
                    :default-value="readerSetting.theme.fontColor"
                    :on-complete="setCustomFontColor"
                    style="width: 8.2em"
                  >
                    <template #label="color">文字：{{ color }}</template>
                  </n-color-picker>
                </n-flex>
              </template>
            </n-flex>
          </c-action-wrapper>

          <c-action-wrapper title="主透明度" align="center">
            <n-slider
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
        </n-flex>
      </n-tab-pane>
    </n-tabs>
  </c-modal>
</template>
