<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';

import NovelGlossaryEditor from '@/components/NovelGlossaryEditor.vue';
import type { GenericNovelId } from '@/model/Common';
import type { Glossary } from '@/model/Glossary';
import { useHorizontalSwipe } from '@/util';

const props = defineProps<{
  gnid?: GenericNovelId;
  glossary: Glossary;
  site: string;
  hideComment: boolean;
  locked?: boolean;
}>();

const slots = useSlots();

const activeTab = ref(
  slots.wenkuToc ? 'wenkuToc' : props.hideComment ? 'glossary' : 'comment',
);

watch(
  () => props.hideComment,
  (hide) => {
    if (hide && activeTab.value === 'comment') {
      activeTab.value = 'glossary';
    }
  },
);

const glossaryCount = computed(() => Object.keys(props.glossary).length);

const editorRef =
  useTemplateRef<InstanceType<typeof NovelGlossaryEditor>>('editorRef');

const tabs = computed(() => [
  ...(slots.wenkuToc
    ? [{ value: 'wenkuToc', label: '目录', slot: 'wenkuToc' as const }]
    : []),
  ...(!props.hideComment
    ? [{ value: 'comment', label: '评论区', slot: 'comment' as const }]
    : []),
  {
    value: 'glossary',
    label: `术语表${glossaryCount.value > 0 ? ` [${glossaryCount.value}]` : ''}`,
    slot: 'glossary' as const,
  },
]);
const availableTabs = computed(() => tabs.value.map((tab) => tab.value));

// 目录和评论首次访问才挂载，之后隐藏保留；术语编辑器仍在离开后卸载。
const visitedTabs = reactive(new Set([activeTab.value]));
watch(activeTab, (tab) => visitedTabs.add(tab), { flush: 'sync' });

let switching = false;
const switchTab = async (value: string | number) => {
  const targetTab = String(value);
  if (
    switching ||
    targetTab === activeTab.value ||
    !availableTabs.value.includes(targetTab)
  ) {
    return;
  }

  // 确认期间忽略重复请求，避免重复弹窗或异步结果覆盖之后的选择。
  switching = true;
  const previousTab = activeTab.value;
  try {
    const allow =
      previousTab !== 'glossary' ||
      !editorRef.value ||
      (await editorRef.value.confirmLeave());
    if (
      allow &&
      activeTab.value === previousTab &&
      availableTabs.value.includes(targetTab)
    ) {
      activeTab.value = targetTab;
    }
  } finally {
    switching = false;
  }
};

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;

  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  ) {
    return;
  }

  if (/^[0-9]$/.test(e.key)) {
    const index = e.key === '0' ? 9 : Number(e.key) - 1;
    const targetTab = availableTabs.value[index];
    if (targetTab) {
      e.preventDefault();
      switchTab(targetTab);
    }
  }
});

const switchAdjacentTab = (offset: -1 | 1) => {
  const tabs = availableTabs.value;
  const index = tabs.indexOf(activeTab.value);
  if (index < 0) return;

  const target = tabs[index + offset];
  if (target !== undefined) {
    void switchTab(target);
  }
};

const swipeTarget = useTemplateRef<HTMLElement>('swipeTarget');
useHorizontalSwipe(swipeTarget, {
  onSwipeLeft: () => switchAdjacentTab(1),
  onSwipeRight: () => switchAdjacentTab(-1),
});
</script>

<template>
  <div ref="swipeTarget" class="novel-bottom-tabs mt-6">
    <UTabs
      :model-value="activeTab"
      :items="tabs"
      variant="link"
      :unmount-on-hide="false"
      :ui="{
        list: 'justify-start',
        trigger: 'flex-none',
        content: 'min-h-[400px]',
      }"
      @update:model-value="switchTab"
    >
      <template #wenkuToc>
        <slot v-if="visitedTabs.has('wenkuToc')" name="wenkuToc" />
      </template>

      <template #comment>
        <template v-if="visitedTabs.has('comment')">
          <slot name="commentNotice" />
          <comment-list :site="site" :locked="locked ?? false" />
        </template>
      </template>

      <template #glossary>
        <NovelGlossaryEditor
          v-if="activeTab === 'glossary'"
          ref="editorRef"
          :gnid="gnid"
          :value="glossary"
        />
      </template>
    </UTabs>
  </div>
</template>
