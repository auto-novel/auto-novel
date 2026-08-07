<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { ArrowDownwardOutlined, ArrowUpwardOutlined } from '@vicons/material';

import { useDraftStore } from '@/stores';
import { useIsWideScreen } from '@/pages/util';

const props = withDefaults(
  defineProps<{
    mode: 'article' | 'comment';
    draftId?: string;
    autosize?:
      | boolean
      | {
          minRows?: number;
          maxRows?: number;
        };
    sticky?: boolean;
    showScrollButtons?: boolean;
  }>(),
  {
    sticky: false,
    showScrollButtons: false,
  },
);

const showTopTooltip = ref<boolean | undefined>(undefined);
const showBottomTooltip = ref<boolean | undefined>(undefined);

const scrollToTop = (event: MouseEvent) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showTopTooltip.value = false;
  if (event.currentTarget) {
    (event.currentTarget as HTMLButtonElement).blur();
  }
  setTimeout(() => {
    showTopTooltip.value = undefined;
  }, 500);
};

const scrollToBottom = (event: MouseEvent) => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  showBottomTooltip.value = false;
  if (event.currentTarget) {
    (event.currentTarget as HTMLButtonElement).blur();
  }
  setTimeout(() => {
    showBottomTooltip.value = undefined;
  }, 500);
};

const value = defineModel<string>('value', { required: true });

useEventListener(window, 'beforeunload', (e) => {
  if (value.value.trim()) {
    e.preventDefault();
    return '有未保存的编辑，确定要离开吗？';
  }
});

const isWideScreen = useIsWideScreen(620);

const showEditorToolbar = ref(true);
const onTabUpdate = (val: number) => {
  showEditorToolbar.value = val === 0;
};

// ==============================
// 草稿
// ==============================

const createdAt = Date.now();
const draftStore = useDraftStore();

const getDrafts = () => {
  if (props.draftId === undefined) return [];
  return draftStore.getDraft(props.draftId);
};

const saveDraft = (text: string) => {
  if (props.draftId && text.trim() !== '') {
    draftStore.addDraft(props.draftId, createdAt, text);
  }
};

const drafts = ref(getDrafts());

const clearDraft = () => {
  if (!props.draftId) return;
  draftStore.removeDraft(props.draftId);
  drafts.value = getDrafts();
};

const elEditor = useTemplateRef('editor');
</script>

<template>
  <n-el tag="div" class="markdown-input" :class="{ 'is-sticky': sticky }">
    <n-tabs
      ref="tab"
      class="tabs"
      type="card"
      size="small"
      @update:value="onTabUpdate"
    >
      <template #suffix>
        <n-flex :size="8" align="center" style="padding: 0 8px; width: 100%" :wrap="false">
          <!-- Scroll buttons on the left of suffix (right next to tabs) -->
          <template v-if="showScrollButtons">
            <n-tooltip trigger="hover" :placement="sticky ? 'bottom' : 'top'" :show="showTopTooltip">
              <template #trigger>
                <n-button size="small" quaternary @click="scrollToTop" style="padding: 0 8px">
                  <template #icon>
                    <n-icon :component="ArrowUpwardOutlined" />
                  </template>
                </n-button>
              </template>
              回到頁首
            </n-tooltip>
            <n-tooltip trigger="hover" :placement="sticky ? 'bottom' : 'top'" :show="showBottomTooltip">
              <template #trigger>
                <n-button size="small" quaternary @click="scrollToBottom" style="padding: 0 8px">
                  <template #icon>
                    <n-icon :component="ArrowDownwardOutlined" />
                  </template>
                </n-button>
              </template>
              回到頁尾
            </n-tooltip>
            <n-divider vertical style="margin: 0 4px" v-if="showEditorToolbar && isWideScreen" />
          </template>

          <div style="flex: 1" />

          <!-- Toolbar on the far right -->
          <MarkdownToolbar
            v-if="showEditorToolbar && isWideScreen"
            :el-textarea="elEditor?.textareaElRef ?? undefined"
            :drafts="drafts"
            :tooltip-placement="sticky ? 'bottom' : 'top'"
            @clear-draft="clearDraft"
          />
        </n-flex>
      </template>
      <n-tab-pane tab="编辑" :name="0" display-directive="show">
        <n-flex
          v-if="!isWideScreen"
          class="mobile-toolbar"
          :size="0"
          align="center"
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
            @input="saveDraft"
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
  background-color: var(--body-color);
}

.markdown-input .tabs .n-tabs-nav {
  --n-tab-gap: 0;
  background-color: var(--card-color);
  margin: -1px 0 0 0;
  border-top: 1px solid var(--border-color);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
}

.markdown-input .tabs .n-tabs-nav-scroll-wrapper {
  flex: 0 0 auto !important;
}

.markdown-input .tabs .n-tabs-nav__suffix {
  flex: 1 !important;
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

/* Ensure Naive UI layouts containing sticky editor do not block sticky positioning */
.n-layout:has(.is-sticky),
.n-layout-content:has(.is-sticky),
.n-layout-scroll-container:has(.is-sticky) {
  overflow: visible !important;
}

/* Sticky Toolbar Styling */
.markdown-input.is-sticky {
  overflow: visible !important;
}

.markdown-input.is-sticky .tabs .n-tabs-nav {
  position: sticky;
  top: 50px; /* Under the 50px fixed layout header */
  z-index: 10;
  background-color: var(--card-color) !important;
  border-top: 1px solid var(--border-color);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
}

.markdown-input.is-sticky .mobile-toolbar {
  position: sticky;
  top: 86px; /* 50px header + 36px tabs navigation height */
  z-index: 1;
  background-color: var(--body-color) !important;
  padding: 4px 8px;
  margin-left: 0 !important;
  margin-right: 0 !important;
  border-bottom: 1px solid var(--border-color);
}
</style>
