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
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
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
const editorRoot = useTemplateRef<HTMLElement>('editorRoot');
const toolbarHost = useTemplateRef<HTMLElement>('toolbarHost');
const toolbarSurface = useTemplateRef<HTMLElement>('toolbarSurface');

const toolbarFixed = ref(false);
const toolbarFixedStyle = ref<Record<string, string>>({});

let toolbarUpdateFrame: number | undefined;
let toolbarResizeObserver: ResizeObserver | undefined;
const updateStickyToolbar = () => {
  if (toolbarUpdateFrame !== undefined) return;

  toolbarUpdateFrame = window.requestAnimationFrame(() => {
    toolbarUpdateFrame = undefined;

    const root = editorRoot.value;
    const host = toolbarHost.value;
    const surface = toolbarSurface.value;
    if (!props.sticky || !root || !host || !surface) {
      toolbarFixed.value = false;
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const toolbarHeight = surface.offsetHeight;
    const shouldFix = hostRect.top <= props.stickyTop && rootRect.bottom > 0;

    toolbarFixed.value = shouldFix;
    if (shouldFix) {
      toolbarFixedStyle.value = {
        top: `${Math.min(props.stickyTop, rootRect.bottom - toolbarHeight)}px`,
        left: `${hostRect.left}px`,
        width: `${hostRect.width}px`,
      };
    }
  });
};

useEventListener(window, 'scroll', updateStickyToolbar, { passive: true });
useEventListener(window, 'resize', updateStickyToolbar, { passive: true });

onMounted(() => {
  updateStickyToolbar();

  toolbarResizeObserver = new ResizeObserver(updateStickyToolbar);
  if (editorRoot.value) toolbarResizeObserver.observe(editorRoot.value);
  if (toolbarHost.value) toolbarResizeObserver.observe(toolbarHost.value);
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
        ref="tab"
        class="tabs"
        type="card"
        size="small"
        @update:value="onTabUpdate"
      >
        <template v-if="isWideScreen" #suffix>
          <div ref="toolbarHost" class="markdown-toolbar-host">
            <div
              ref="toolbarSurface"
              class="markdown-toolbar-surface"
              :class="{ 'is-fixed': toolbarFixed }"
              :style="toolbarFixed ? toolbarFixedStyle : undefined"
            >
              <n-flex
                :size="8"
                align="center"
                style="padding: 0 8px; width: 100%"
                :wrap="false"
              >
                <template v-if="showScrollButtons">
                  <n-tooltip
                    trigger="hover"
                    :placement="sticky ? 'bottom' : 'top'"
                    :show="showTopTooltip"
                  >
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
                  <n-tooltip
                    trigger="hover"
                    :placement="sticky ? 'bottom' : 'top'"
                    :show="showBottomTooltip"
                  >
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
                    v-if="showEditorToolbar && isWideScreen"
                    vertical
                    style="margin: 0 4px"
                  />
                </template>

                <div style="flex: 1" />

                <MarkdownToolbar
                  v-if="showEditorToolbar && isWideScreen"
                  :el-textarea="elEditor?.textareaElRef ?? undefined"
                  :drafts="drafts"
                  :tooltip-placement="sticky ? 'bottom' : 'top'"
                  @clear-draft="clearDraft"
                />
              </n-flex>
            </div>
          </div>
        </template>
        <n-tab-pane tab="编辑" :name="0" display-directive="show">
          <div
            v-if="!isWideScreen"
            ref="toolbarHost"
            class="markdown-toolbar-host mobile-toolbar-host"
          >
            <div
              ref="toolbarSurface"
              class="markdown-toolbar-surface mobile-toolbar"
              :class="{ 'is-fixed': toolbarFixed }"
              :style="toolbarFixed ? toolbarFixedStyle : undefined"
            >
              <n-flex :size="0" align="center">
                <template v-if="showScrollButtons">
                  <n-tooltip
                    trigger="hover"
                    placement="bottom"
                    :show="showTopTooltip"
                  >
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
                  <n-tooltip
                    trigger="hover"
                    placement="bottom"
                    :show="showBottomTooltip"
                  >
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
                  <n-divider vertical style="margin: 0 4px" />
                </template>
                <MarkdownToolbar
                  :el-textarea="elEditor?.textareaElRef ?? undefined"
                  :drafts="drafts"
                  tooltip-placement="bottom"
                  @clear-draft="clearDraft"
                />
              </n-flex>
            </div>
          </div>

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
  </div>
</template>

<style>
.markdown-input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--body-color);
}

.markdown-editor-boundary {
  width: 100%;
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

.markdown-toolbar-host {
  width: 100%;
  min-height: 34px;
}

.markdown-toolbar-surface {
  box-sizing: border-box;
  min-height: 34px;
  background-color: var(--card-color) !important;
}

.markdown-toolbar-surface.is-fixed {
  position: fixed;
  z-index: 1;
}

.mobile-toolbar-host {
  min-height: 42px;
}

.mobile-toolbar {
  min-height: 42px;
  background-color: var(--body-color) !important;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
}
</style>
