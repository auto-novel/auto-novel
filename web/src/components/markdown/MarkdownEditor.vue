<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

import { useDraftStore } from '@/stores';
import { useIsWideScreen } from '@/pages/util';

const props = defineProps<{
  mode: 'article' | 'comment';
  draftId?: string;
  autosize?:
    | boolean
    | {
        minRows?: number;
        maxRows?: number;
      };
}>();

const value = defineModel<string>('value', { required: true });
const activeTab = defineModel<number>('activeTab', { default: 0 });

useEventListener(window, 'beforeunload', (e) => {
  if (value.value.trim()) {
    e.preventDefault();
    return '有未保存的编辑，确定要离开吗？';
  }
});

const isWideScreen = useIsWideScreen(620);

const showEditorToolbar = computed(() => activeTab.value === 0);

// ==============================
// 草稿
// ==============================

const createdAt = Date.now();
const draftStore = useDraftStore();
const hasBeenModified = ref(false);

const getDrafts = () => {
  if (props.draftId === undefined) return [];
  return draftStore.getDraft(props.draftId);
};

const saveDraft = (text: string) => {
  if (props.draftId && text.trim() !== '' && hasBeenModified.value) {
    draftStore.addDraft(props.draftId, createdAt, text);
  }
};

const drafts = ref(
  getDrafts().filter((d) => d.createdAt.getTime() !== createdAt),
);

watch(
  () => getDrafts(),
  (newDrafts) => {
    const filtered = newDrafts.filter(
      (d) => d.createdAt.getTime() !== createdAt,
    );
    if (JSON.stringify(filtered) !== JSON.stringify(drafts.value)) {
      drafts.value = filtered;
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  saveDraft(value.value);
});

const clearDraft = () => {
  if (!props.draftId) return;
  draftStore.removeDraft(props.draftId);
};

const elEditor = useTemplateRef('editor');

defineExpose({
  elTextarea: computed(() => elEditor.value?.textareaElRef ?? undefined),
  drafts,
  clearDraft,
});
</script>

<template>
  <n-el tag="div" class="markdown-input">
    <n-tabs
      ref="tab"
      v-model:value="activeTab"
      class="tabs"
      type="card"
      size="small"
    >
      <template v-if="showEditorToolbar && isWideScreen" #suffix>
        <MarkdownToolbar
          :el-textarea="elEditor?.textareaElRef ?? undefined"
          :drafts="drafts"
          @clear-draft="clearDraft"
        />
      </template>
      <n-tab-pane tab="编辑" :name="0" display-directive="show">
        <n-flex
          v-if="!isWideScreen"
          :size="0"
          align="center"
          style="margin-left: 8px; margin-bottom: 8px"
        >
          <MarkdownToolbar
            :el-textarea="elEditor?.textareaElRef ?? undefined"
            :drafts="drafts"
            @clear-draft="clearDraft"
          />
        </n-flex>

        <div style="padding: 0 8px 8px">
          <n-input
            ref="editor"
            v-bind="$attrs"
            v-model:value="value"
            type="textarea"
            show-count
            :input-props="{ spellcheck: false }"
            @input="
              (text: string) => {
                hasBeenModified = true;
                saveDraft(text);
              }
            "
            :autosize="autosize || { minRows: 8 }"
          />
        </div>
      </n-tab-pane>
      <n-tab-pane tab="预览" :name="1">
        <div style="padding: 0px 16px">
          <MarkdownView
            :mode="mode"
            :source="(value as string) || '没有可预览的内容'"
          />
        </div>
      </n-tab-pane>
    </n-tabs>
  </n-el>
</template>

<style>
.markdown-input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.markdown-input .tabs .n-tabs-nav {
  --n-tab-gap: 0;
  background-color: var(--tab-color);
  margin: -1px 0 0 -1px;
}

.markdown-input .tabs .n-tabs-tab:not(.n-tabs-tab--active) {
  --n-tab-color: transparent;
  border-top-color: transparent !important;
  border-left-color: transparent !important;
  border-right-color: transparent !important;
}

.markdown-input .tabs .n-tabs-tab--active {
  background-color: var(--body-color) !important;
  border-bottom-color: var(--body-color) !important;
}
</style>
