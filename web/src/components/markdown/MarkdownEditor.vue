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
    stickyTop?: number;
    showScrollButtons?: boolean;
  }>(),
  {
    sticky: false,
    stickyTop: 50,
    showScrollButtons: false,
  },
);

const scrollToTop = (event: MouseEvent) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (event.currentTarget) {
    (event.currentTarget as HTMLButtonElement).blur();
  }
};

const scrollToBottom = (event: MouseEvent) => {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
  if (event.currentTarget) {
    (event.currentTarget as HTMLButtonElement).blur();
  }
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
  nextTick(updateStickyToolbar);
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
const editorRoot = useTemplateRef<HTMLElement>('editorRoot');
const tabsInst = useTemplateRef<any>('tabsInst');

const toolbarFixed = ref(false);
const placeholderHeight = ref(0);

let toolbarUpdateFrame: number | undefined;
let toolbarResizeObserver: ResizeObserver | undefined;

const updateStickyToolbar = () => {
  if (toolbarUpdateFrame !== undefined) return;

  toolbarUpdateFrame = window.requestAnimationFrame(() => {
    toolbarUpdateFrame = undefined;

    const root = editorRoot.value;
    const tabsEl = tabsInst.value?.$el as HTMLElement | undefined;
    const navEl = tabsEl?.querySelector('.n-tabs-nav') as
      | HTMLElement
      | undefined;

    if (!props.sticky || !root || !tabsEl || !navEl) {
      if (toolbarFixed.value) {
        toolbarFixed.value = false;
        placeholderHeight.value = 0;
        if (navEl) {
          navEl.classList.remove('is-fixed');
          navEl.style.position = '';
          navEl.style.top = '';
          navEl.style.left = '';
          navEl.style.width = '';
          navEl.style.zIndex = '';
        }
      }
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const tabsRect = tabsEl.getBoundingClientRect();
    const toolbarHeight = navEl.offsetHeight;
    const shouldFix =
      tabsRect.top <= props.stickyTop &&
      rootRect.bottom > props.stickyTop + toolbarHeight;

    toolbarFixed.value = shouldFix;
    if (shouldFix) {
      placeholderHeight.value = toolbarHeight;
      navEl.classList.add('is-fixed');
      Object.assign(navEl.style, {
        position: 'fixed',
        top: `${Math.min(props.stickyTop, rootRect.bottom - toolbarHeight)}px`,
        left: `${tabsRect.left}px`,
        width: `${tabsRect.width}px`,
        zIndex: '10',
      });
    } else {
      placeholderHeight.value = 0;
      navEl.classList.remove('is-fixed');
      navEl.style.position = '';
      navEl.style.top = '';
      navEl.style.left = '';
      navEl.style.width = '';
      navEl.style.zIndex = '';
    }
  });
};

useEventListener(window, 'scroll', updateStickyToolbar, { passive: true });
useEventListener(window, 'resize', updateStickyToolbar, { passive: true });

onMounted(() => {
  updateStickyToolbar();

  toolbarResizeObserver = new ResizeObserver(updateStickyToolbar);
  if (editorRoot.value) toolbarResizeObserver.observe(editorRoot.value);
  if (tabsInst.value?.$el) toolbarResizeObserver.observe(tabsInst.value.$el);
});

onBeforeUnmount(() => {
  toolbarResizeObserver?.disconnect();
  if (toolbarUpdateFrame !== undefined) {
    window.cancelAnimationFrame(toolbarUpdateFrame);
  }
});

watch([isWideScreen, () => props.sticky], () => nextTick(updateStickyToolbar));
</script>

<template>
  <div ref="editorRoot" class="markdown-editor-boundary">
    <n-el tag="div" class="markdown-input">
      <n-tabs
        ref="tabsInst"
        class="tabs"
        type="card"
        size="small"
        @update:value="onTabUpdate"
      >
        <template #suffix>
          <!-- Desktop Layout -->
          <div v-if="isWideScreen" class="markdown-toolbar-surface">
            <n-flex
              :size="8"
              align="center"
              style="padding: 0 8px; width: 100%; height: 100%"
              :wrap="false"
            >
              <template v-if="showScrollButtons">
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-button
                      size="small"
                      quaternary
                      style="padding: 0 8px"
                      @click="scrollToTop"
                    >
                      <template #icon>
                        <n-icon :component="ArrowUpwardOutlined" />
                      </template>
                    </n-button>
                  </template>
                  回到頁首
                </n-tooltip>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-button
                      size="small"
                      quaternary
                      style="padding: 0 8px"
                      @click="scrollToBottom"
                    >
                      <template #icon>
                        <n-icon :component="ArrowDownwardOutlined" />
                      </template>
                    </n-button>
                  </template>
                  回到頁尾
                </n-tooltip>
                <n-divider
                  v-if="showEditorToolbar"
                  vertical
                  style="margin: 0 4px"
                />
              </template>

              <div style="flex: 1" />

              <MarkdownToolbar
                v-if="showEditorToolbar"
                :el-textarea="elEditor?.textareaElRef ?? undefined"
                :drafts="drafts"
                tooltip-placement="top"
                @clear-draft="clearDraft"
              />
            </n-flex>
          </div>

          <!-- Mobile Layout -->
          <template v-else>
            <div class="mobile-jump-buttons">
              <n-flex
                v-if="showScrollButtons"
                :size="4"
                align="center"
                :wrap="false"
                style="height: 100%"
              >
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-button
                      size="small"
                      quaternary
                      style="padding: 0 6px"
                      @click="scrollToTop"
                    >
                      <template #icon>
                        <n-icon :component="ArrowUpwardOutlined" />
                      </template>
                    </n-button>
                  </template>
                  回到頁首
                </n-tooltip>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-button
                      size="small"
                      quaternary
                      style="padding: 0 6px"
                      @click="scrollToBottom"
                    >
                      <template #icon>
                        <n-icon :component="ArrowDownwardOutlined" />
                      </template>
                    </n-button>
                  </template>
                  回到頁尾
                </n-tooltip>
              </n-flex>
            </div>

            <div v-if="showEditorToolbar" class="mobile-toolbar-line2">
              <MarkdownToolbar
                :el-textarea="elEditor?.textareaElRef ?? undefined"
                :drafts="drafts"
                tooltip-placement="top"
                @clear-draft="clearDraft"
              />
            </div>
          </template>
        </template>

        <n-tab-pane tab="编辑" :name="0" display-directive="show">
          <div
            v-if="toolbarFixed"
            class="toolbar-placeholder"
            :style="{ height: `${placeholderHeight}px` }"
          />
          <div class="editor-input-wrapper">
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
          <div
            v-if="toolbarFixed"
            class="toolbar-placeholder"
            :style="{ height: `${placeholderHeight}px` }"
          />
          <div style="padding: 12px 16px">
            <MarkdownView
              :mode="mode"
              :source="(value as string) || '没有可预览的内容'"
            />
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-el>
  </div>
</template>

<style>
.markdown-input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--body-color);
  position: relative;
  z-index: 0;
}

.markdown-editor-boundary {
  width: 100%;
}

.markdown-input .tabs .n-tabs-nav {
  --n-tab-gap: 0;
  background-color: var(--card-color);
  margin: 0;
  border-top: none;
  border-bottom: 1px solid var(--border-color);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  box-sizing: border-box;
  position: relative;
  z-index: 2;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
}

.markdown-input .tabs .n-tabs-nav.is-fixed {
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.markdown-input .tabs .n-tabs-nav-scroll-wrapper {
  flex: 0 0 auto !important;
}

.markdown-input .tabs .n-tabs-nav__suffix {
  flex: 1 !important;
  display: flex !important;
  align-items: center !important;
  height: 100% !important;
  padding: 0 !important;
  border-bottom: none !important;
}

/* On mobile views, unwrap suffix contents so jump buttons sit directly next to tabs on line 1, and line 2 wraps below */
@media (max-width: 619px) {
  .markdown-input .tabs .n-tabs-nav__suffix {
    display: contents !important;
  }
}

.markdown-input .tabs .n-tabs-nav__suffix::-webkit-scrollbar {
  display: none !important;
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

.markdown-toolbar-surface {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  background-color: var(--card-color) !important;
}

.mobile-jump-buttons {
  display: flex;
  align-items: center;
  padding-left: 8px;
  height: 34px;
}

.mobile-toolbar-line2 {
  width: 100%;
  overflow-x: auto;
  border-top: 1px solid var(--border-color);
  padding: 4px 8px;
  box-sizing: border-box;
  background-color: var(--card-color);
  scrollbar-width: none;
}

.mobile-toolbar-line2::-webkit-scrollbar {
  display: none;
}

.toolbar-placeholder {
  width: 100%;
  flex-shrink: 0;
}

.editor-input-wrapper {
  padding: 8px;
  position: relative;
  z-index: 1;
}

/* 避免 textarea 焦点边框高亮穿透到 toolbar 上方 */
.editor-input-wrapper .n-input {
  background-color: var(--body-color);
}

.editor-input-wrapper .n-input .n-input-wrapper {
  z-index: 1;
}

.editor-input-wrapper .n-input.n-input--focus {
  z-index: 1;
}

.editor-input-wrapper .n-input .n-input__border,
.editor-input-wrapper .n-input .n-input__state-border {
  z-index: 1;
}
</style>
