<script lang="ts" setup>
import { InfoOutlined } from '@vicons/material';

import { hasAddonInstalled } from '@/external/addon';
import type { GenericNovelId } from '@/model/Common';
import type { TranslateTaskOptions } from '@/domain/translator';
import { useWhoamiStore } from '@/stores';

const probs = defineProps<{
  gnid: GenericNovelId;
}>();
const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const translateLevelTooltip = computed(() =>
  [
    '常规：只翻译未翻译的章节',
    '过期：翻译术语表过期的章节',
    '重翻：重翻全部章节',
    ...(probs.gnid.type === 'web'
      ? [
          '源站同步：用于原作者修改了原文的情况导致不一致的情况，可能清空现有翻译，慎用！!',
        ]
      : []),
  ].join('\n'),
);

// 翻译设置
const translateLevel = ref<TranslateTaskOptions['level']>(
  probs.gnid.type === 'local' ? 'expire' : 'normal',
);
const forceMetadata = ref(false);
const useBrowserCrawler = ref(hasAddonInstalled());

const checkAddon = () => {
  if (hasAddonInstalled()) {
    useBrowserCrawler.value = true;
  }
};

onMounted(() => {
  checkAddon();
  window.addEventListener('auto-novel-addon-ready', checkAddon);
});

onUnmounted(() => {
  window.removeEventListener('auto-novel-addon-ready', checkAddon);
});

const startIndex = ref<number | null>(0);
const endIndex = ref<number | null>(null);

defineExpose({
  getTranslateTaskParams: (): TranslateTaskOptions => ({
    level: translateLevel.value,
    forceMetadata: forceMetadata.value,
    useBrowserCrawler: probs.gnid.type === 'web' && useBrowserCrawler.value,
    startIndex: startIndex.value ?? 0,
    endIndex: endIndex.value ?? undefined,
  }),
});
</script>

<template>
  <div class="flex flex-col gap-y-2">
    <c-action-wrapper title="选项">
      <div class="flex flex-wrap gap-x-2 gap-y-1">
        <UTooltip :text="translateLevelTooltip" :ui="{ content: 'max-w-50' }">
          <div class="flex">
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
          </div>
        </UTooltip>

        <tag-button
          v-if="gnid.type === 'web'"
          label="重翻目录"
          v-model:checked="forceMetadata"
        />
        <tag-button
          v-if="gnid.type === 'web' && whoami.hasNovelAccess"
          type="warning"
          label="浏览器爬虫"
          v-model:checked="useBrowserCrawler"
        />

        <span
          class="basis-full text-[12px] text-warning"
          v-if="translateLevel === 'all' || translateLevel === 'sync'"
        >
          <b>* 请确保你知道自己在干啥，不要随便使用危险功能</b>
        </span>

        <span
          class="basis-full text-[12px] text-warning"
          v-if="gnid.type === 'web' && whoami.hasNovelAccess"
        >
          <b>* 浏览器爬虫还处于测试阶段，翻译后务必检查结果</b>
        </span>
      </div>
    </c-action-wrapper>

    <c-action-wrapper
      v-if="gnid.type === 'web' || gnid.type === 'local'"
      title="范围"
    >
      <div class="flex flex-wrap gap-x-3 gap-y-2 text-center">
        <div>
          <UFieldGroup size="sm">
            <UBadge
              label="从"
              color="neutral"
              variant="outline"
              class="rounded-sm px-2 font-normal"
            />
            <UInputNumber
              v-model="startIndex"
              :increment="false"
              :decrement="false"
              :min="0"
              class="w-20"
            />
            <UBadge
              label="到"
              color="neutral"
              variant="outline"
              class="rounded-sm px-2 font-normal"
            />
            <UInputNumber
              v-model="endIndex"
              placeholder="不限"
              :increment="false"
              :decrement="false"
              :min="0"
              class="w-20"
            />
          </UFieldGroup>
        </div>

        <UTooltip
          :text="'章节序号见下方目录方括号中的数字\n“从0到10”即第0–9章，不含第10章'"
        >
          <UButton
            :icon="InfoOutlined"
            :ui="{ leadingIcon: 'size-4 shrink-0 opacity-60' }"
            color="neutral"
            variant="link"
            class="p-0"
            aria-label="章节范围说明"
          />
        </UTooltip>
      </div>
    </c-action-wrapper>
  </div>
</template>
