<script lang="ts" setup>
import { useId } from 'vue';

import { useIsWideScreen } from '@/pages/util';
import { ReaderSetting, useReaderSettingStore } from '@/stores';
import { checkIsMobile } from '@/util';
import { AddOutlined, MinusOutlined } from '@vicons/material';

const tabs = [
  { label: '内容', value: 'content', slot: 'content' },
  { label: '样式', value: 'appearance', slot: 'appearance' },
];

const open = defineModel<boolean>('open', { default: false });
const popupTargetId = useId();
const isMobile = checkIsMobile();
const isWideScreen = useIsWideScreen(600);

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const selectTheme = (bodyColor: string) => {
  const theme = ReaderSetting.themeOptions.find(
    (theme) => theme.bodyColor === bodyColor,
  );
  if (theme) readerSetting.value.theme = { mode: 'custom', ...theme };
};

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
      body: 'flex min-h-0 flex-col p-0 sm:p-0 overflow-visible',
      title: 'sr-only',
      header: 'absolute top-0 right-0 z-10 p-0 sm:p-0 border-0',
    }"
  >
    <template #body>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 表单内置浮层放在弹窗内、滚动区外，避免跨库模态隔离和滚动裁剪。 -->
        <div :id="popupTargetId" class="shrink-0" />
        <div class="max-h-[80dvh] min-h-0 flex-1 overflow-y-auto">
          <UTabs
            :items="tabs"
            default-value="content"
            variant="link"
            size="lg"
            class="w-full"
            :ui="{
              root: 'gap-0',
              list: 'mx-5 w-auto self-stretch pr-10',
            }"
          >
            <template #content>
              <div class="box-border flex w-full flex-col gap-y-3 p-5">
                <c-action-wrapper
                  title="语言"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    v-model="readerSetting.mode"
                    :items="ReaderSetting.modeOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper
                  title="翻译"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
                    <URadioGroup
                      orientation="horizontal"
                      variant="table"
                      indicator="hidden"
                      :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                      v-model="readerSetting.translationsMode"
                      :items="ReaderSetting.translationModeOptions"
                    />
                    <translator-check
                      v-model:value="readerSetting.translations"
                      show-order
                      :two-line="!isWideScreen"
                    />
                  </div>
                </c-action-wrapper>

                <c-action-wrapper
                  v-if="isMobile"
                  title="点按区域"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    v-model="readerSetting.clickArea"
                    :items="ReaderSetting.clickAreaOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper
                  title="朗读语言"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    :model-value="readerSetting.speakLanguages[0]"
                    @update:model-value="
                      readerSetting.speakLanguages = [$event]
                    "
                    :items="ReaderSetting.speakLanguagesOptions"
                  />
                </c-action-wrapper>
                <c-action-wrapper
                  title="翻页模式"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    v-model="readerSetting.pageTurnMode"
                    :items="ReaderSetting.pageTurnModeOptions"
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
            </template>

            <template #appearance>
              <div class="flex w-full flex-col gap-y-3 p-5">
                <c-action-wrapper
                  title="字重"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    v-model="readerSetting.fontWeight"
                    :items="ReaderSetting.fontWeightOptions"
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
                  <span class="w-[6em] text-default">
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
                  <span class="w-[6em] text-default">
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
                  <span class="w-[6em] text-default">
                    {{ readerSetting.pageWidth }}px
                  </span>
                </c-action-wrapper>

                <c-action-wrapper
                  title="下划线"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <URadioGroup
                    orientation="horizontal"
                    variant="table"
                    indicator="hidden"
                    :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                    v-model="readerSetting.textUnderline"
                    :items="ReaderSetting.textUnderlineOptions"
                  />
                </c-action-wrapper>

                <c-action-wrapper
                  title="主题"
                  align="start"
                  title-class="leading-[30px]"
                >
                  <div class="flex flex-col gap-y-3">
                    <URadioGroup
                      orientation="horizontal"
                      variant="table"
                      indicator="hidden"
                      :ui="{ fieldset: 'flex-wrap', item: 'px-2 py-1' }"
                      v-model="readerSetting.theme.mode"
                      :items="ReaderSetting.themeModeOptions"
                    />
                    <template v-if="readerSetting.theme.mode === 'custom'">
                      <URadioGroup
                        :model-value="readerSetting.theme.bodyColor"
                        :items="ReaderSetting.themeOptions"
                        value-key="bodyColor"
                        label-key="bodyColor"
                        orientation="horizontal"
                        :ui="{ fieldset: 'gap-x-3 gap-y-2' }"
                        aria-label="预设阅读配色"
                        @update:model-value="selectTheme"
                      >
                        <template #label="{ item }">
                          <span
                            class="inline-block rounded px-1.5 py-0.5 text-center font-normal"
                            :class="isWideScreen ? 'w-[5.5em]' : 'w-[2em]'"
                            :style="{
                              backgroundColor: item.bodyColor,
                              color: item.fontColor,
                            }"
                          >
                            {{ isWideScreen ? item.bodyColor : '#' }}
                          </span>
                        </template>
                      </URadioGroup>
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
                  <span class="w-[6em] text-default">
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
                  <span class="w-[6em] text-default">
                    {{ (readerSetting.mixJpOpacity * 100).toFixed(0) }}%
                  </span>
                </c-action-wrapper>
              </div>
            </template>
          </UTabs>
        </div>
      </div>
    </template>
  </UModal>
</template>
