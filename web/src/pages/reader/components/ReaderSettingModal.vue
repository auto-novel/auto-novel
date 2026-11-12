<script lang="ts" setup>
import { useId } from 'vue';

import { useIsWideScreen } from '@/pages/util';
import { ReaderSetting, useReaderSettingStore } from '@/stores';
import { checkIsMobile } from '@/util';
import { AddOutlined, MinusOutlined } from '@vicons/material';

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
  <UModal
    v-model:open="open"
    title="阅读设置"
    class="w-150"
    :ui="{
      content: 'max-w-[calc(100vw-2rem)] overflow-visible',
      body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0 overflow-visible',
      title: 'sr-only',
      header: 'absolute top-0 right-0 z-10 min-h-0 p-0 sm:p-0 border-0',
    }"
  >
    <template #body>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 表单内置浮层放在弹窗内、滚动区外，避免跨库模态隔离和滚动裁剪。 -->
        <div :id="popupTargetId" class="shrink-0" />
        <div class="max-h-[80dvh] min-h-0 flex-1 overflow-y-auto">
          <n-tabs
            type="line"
            size="large"
            :tabs-padding="20"
            pane-style="padding: 0px;"
            animated
            class="w-full!"
          >
            <n-tab-pane name="signin" tab="内容">
              <div class="box-border flex w-full flex-col gap-y-3 p-5">
                <c-action-wrapper title="语言">
                  <c-radio-group
                    v-model:value="readerSetting.mode"
                    :options="ReaderSetting.modeOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper title="翻译">
                  <div class="flex flex-wrap gap-x-4 gap-y-3">
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
                    @update-value="
                      (it: any) => (readerSetting.pageTurnMode = it)
                    "
                    :options="ReaderSetting.pageTurnModeOptions"
                  />
                </c-action-wrapper>
                <c-action-wrapper
                  v-if="isMobile"
                  title="点按动画"
                  align="center"
                >
                  <USwitch
                    v-model="readerSetting.enableClickAnimition"
                    aria-label="点按动画"
                  />
                </c-action-wrapper>
                <c-action-wrapper title="显示翻译来源" align="center">
                  <USwitch
                    v-model="readerSetting.enableSourceLabel"
                    aria-label="显示翻译来源"
                  />
                </c-action-wrapper>
                <c-action-wrapper title="折叠插图" align="center">
                  <USwitch
                    v-model="readerSetting.foldImages"
                    aria-label="折叠插图"
                  />
                </c-action-wrapper>
                <c-action-wrapper title="缩进修正" align="center">
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <USwitch
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
                      <UFieldGroup size="sm">
                        <UButton
                          color="neutral"
                          variant="outline"
                          aria-label="减少缩进"
                          @click="setIndentSize(-1)"
                          class="shrink-0 justify-center px-2.5"
                        >
                          <template #leading>
                            <MinusOutlined
                              class="size-4 shrink-0"
                              aria-hidden="true"
                            />
                          </template>
                        </UButton>
                        <UInput
                          :model-value="readerSetting.indentSize + ' 字符'"
                          class="w-17.5"
                          :ui="{ base: 'text-center' }"
                          aria-label="缩进值"
                          readonly
                        />
                        <UButton
                          color="neutral"
                          variant="outline"
                          aria-label="增加缩进"
                          @click="setIndentSize(1)"
                          class="shrink-0 justify-center px-2.5"
                        >
                          <template #leading>
                            <AddOutlined
                              class="size-4 shrink-0"
                              aria-hidden="true"
                            />
                          </template>
                        </UButton>
                      </UFieldGroup>
                    </c-action-wrapper>
                  </div>
                </c-action-wrapper>

                <span class="text-muted text-[12px]">
                  # 左/右方向键跳转章节，数字键1～3切换翻译
                </span>
              </div>
            </n-tab-pane>

            <n-tab-pane name="signup" tab="样式">
              <div class="flex w-full flex-col gap-y-3 p-5">
                <c-action-wrapper title="字重">
                  <c-radio-group
                    v-model:value="readerSetting.fontWeight"
                    :options="ReaderSetting.fontWeightOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper title="字号" align="center">
                  <USlider
                    :tooltip="{
                      text: `${readerSetting.fontSize}px`,
                      portal: false,
                    }"
                    aria-label="字号"
                    v-model="readerSetting.fontSize"
                    :min="14"
                    :max="40"
                    class="flex-auto"
                  />
                  <span class="w-[6em] text-ink">
                    {{ readerSetting.fontSize }}px
                  </span>
                </c-action-wrapper>

                <c-action-wrapper title="行距" align="center">
                  <USlider
                    :tooltip="{
                      text: readerSetting.lineSpace.toFixed(1),
                      portal: false,
                    }"
                    aria-label="行距"
                    v-model="readerSetting.lineSpace"
                    :step="0.1"
                    :min="0"
                    :max="2"
                    class="flex-auto"
                  />
                  <span class="w-[6em] text-ink">
                    {{ readerSetting.lineSpace.toFixed(1) }}
                  </span>
                </c-action-wrapper>

                <c-action-wrapper title="页宽" align="center">
                  <USlider
                    :tooltip="{
                      text: `${readerSetting.pageWidth}px`,
                      portal: false,
                    }"
                    aria-label="页宽"
                    v-model="readerSetting.pageWidth"
                    :step="50"
                    :min="600"
                    :max="1200"
                    class="flex-auto"
                  />
                  <span class="w-[6em] text-ink">
                    {{ readerSetting.pageWidth }}px
                  </span>
                </c-action-wrapper>

                <c-action-wrapper title="下划线">
                  <c-radio-group
                    v-model:value="readerSetting.textUnderline"
                    :options="ReaderSetting.textUnderlineOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper title="主题">
                  <div class="flex flex-col gap-y-3">
                    <c-radio-group
                      v-model:value="readerSetting.theme.mode"
                      :options="ReaderSetting.themeModeOptions"
                    />
                    <template v-if="readerSetting.theme.mode === 'custom'">
                      <div class="flex flex-wrap gap-x-3 gap-y-2">
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
                            :class="isWideScreen ? 'w-[5.5em]' : 'w-[2em]'"
                          >
                            {{ isWideScreen ? theme.bodyColor : '#' }}
                          </n-tag>
                        </n-radio>
                      </div>
                      <USeparator class="m-0" />
                      <div class="flex flex-wrap gap-x-3 gap-y-2">
                        <n-color-picker
                          :to="`#${popupTargetId}`"
                          :modes="['hex']"
                          :show-alpha="false"
                          v-model:value="readerSetting.theme.bodyColor"
                          class="w-[8.2em]!"
                        >
                          <template #label="color">背景：{{ color }}</template>
                        </n-color-picker>
                        <n-color-picker
                          :to="`#${popupTargetId}`"
                          :modes="['hex']"
                          :show-alpha="false"
                          v-model:value="readerSetting.theme.fontColor"
                          class="w-[8.2em]!"
                        >
                          <template #label="color">文字：{{ color }}</template>
                        </n-color-picker>
                      </div>
                    </template>
                  </div>
                </c-action-wrapper>

                <c-action-wrapper title="主透明度" align="center">
                  <USlider
                    :tooltip="{
                      text: `${(readerSetting.mixZhOpacity * 100).toFixed(0)}%`,
                      portal: false,
                    }"
                    aria-label="主透明度"
                    v-model="readerSetting.mixZhOpacity"
                    :max="1"
                    :min="0"
                    :step="0.05"
                    class="flex-auto"
                  />
                  <span class="w-[6em] text-ink">
                    {{ (readerSetting.mixZhOpacity * 100).toFixed(0) }}%
                  </span>
                </c-action-wrapper>

                <c-action-wrapper title="辅透明度" align="center">
                  <USlider
                    :tooltip="{
                      text: `${(readerSetting.mixJpOpacity * 100).toFixed(0)}%`,
                      portal: false,
                    }"
                    aria-label="辅透明度"
                    v-model="readerSetting.mixJpOpacity"
                    :max="1"
                    :min="0"
                    :step="0.05"
                  />
                  <span class="w-[6em] text-ink">
                    {{ (readerSetting.mixJpOpacity * 100).toFixed(0) }}%
                  </span>
                </c-action-wrapper>
              </div>
            </n-tab-pane>
          </n-tabs>
        </div>
      </div>
    </template>
  </UModal>
</template>
