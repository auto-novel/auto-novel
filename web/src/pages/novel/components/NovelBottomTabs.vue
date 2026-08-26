<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';

import NovelGlossaryEditor from '@/components/NovelGlossaryEditor.vue';
import type { GenericNovelId } from '@/model/Common';
import type { Glossary } from '@/model/Glossary';

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

const handleBeforeLeave = (name: string, oldName: string) => {
  if (oldName === 'glossary' && editorRef.value) {
    return editorRef.value.confirmLeave();
  }
  return true;
};

const availableTabs = computed(() => {
  const tabs: string[] = [];
  if (slots.wenkuToc) tabs.push('wenkuToc');
  if (!props.hideComment) tabs.push('comment');
  tabs.push('glossary');
  return tabs;
});

const switchTab = async (targetTab: string) => {
  if (targetTab === activeTab.value) return;
  const allow = await handleBeforeLeave(targetTab, activeTab.value);
  if (allow) {
    activeTab.value = targetTab;
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
</script>

<template>
  <div class="novel-bottom-tabs" style="margin-top: 24px">
    <n-tabs
      v-model:value="activeTab"
      type="line"
      animated
      :on-before-leave="handleBeforeLeave"
    >
      <n-tab-pane
        v-if="$slots.wenkuToc"
        name="wenkuToc"
        tab="目录"
        style="min-height: 400px"
      >
        <slot name="wenkuToc" />
      </n-tab-pane>

      <n-tab-pane
        v-if="!hideComment"
        name="comment"
        tab="评论区"
        style="min-height: 400px"
      >
        <comment-list :site="site" :locked="locked ?? false" />
      </n-tab-pane>

      <n-tab-pane
        name="glossary"
        :tab="`术语表${glossaryCount > 0 ? ` [${glossaryCount}]` : ''}`"
        style="min-height: 400px"
      >
        <NovelGlossaryEditor ref="editorRef" :gnid="gnid" :value="glossary" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
