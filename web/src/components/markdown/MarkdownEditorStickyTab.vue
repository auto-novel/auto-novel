<script setup lang="ts">
import {
  KeyboardArrowDownOutlined,
  KeyboardArrowUpOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@vicons/material';

import { useIsWideScreen } from '@/pages/util';
import { useSettingStore } from '@/stores';
import { useLocalStorage } from '@/util';
import MarkdownToolbar from './MarkdownToolbar.vue';

const activeTab = defineModel<number>('activeTab', { required: true });

const props = defineProps<{
  elEditor?: {
    elTextarea?: HTMLTextAreaElement;
    drafts: any[];
    clearDraft: () => void;
  };
}>();

const isWideScreen = useIsWideScreen();
const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const stickyBarLeftOffset = computed(() => {
  if (!isWideScreen.value) return '0';
  return setting.value.menuCollapsed ? '64px' : '240px';
});

const isCollapsed = useLocalStorage('markdown-editor-collapsed', {
  collapsed: false,
});

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const scrollToBottom = () => {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
};

const toggleCollapse = () => {
  isCollapsed.value.collapsed = !isCollapsed.value.collapsed;
};
</script>

<template>
  <div class="sticky-bottom-tab">
    <div class="fold-button-fixed">
      <n-button
        quaternary
        size="small"
        :focusable="false"
        :title="isCollapsed.collapsed ? '展开' : '折叠'"
        @click="toggleCollapse"
        @mouseup="(e: any) => (e.target as HTMLElement).blur()"
      >
        <template #icon>
          <n-icon
            :component="
              isCollapsed.collapsed
                ? KeyboardArrowUpOutlined
                : KeyboardArrowDownOutlined
            "
          />
        </template>
      </n-button>
    </div>

    <div
      class="sliding-container"
      :class="{ collapsed: isCollapsed.collapsed }"
    >
      <div class="container">
        <n-flex class="content" align="center" :wrap="false">
          <n-button quaternary size="small" title="最上" @click="scrollToTop">
            <template #icon>
              <n-icon :component="VerticalAlignTopOutlined" />
            </template>
          </n-button>
          <n-button
            quaternary
            size="small"
            title="最下"
            @click="scrollToBottom"
          >
            <template #icon>
              <n-icon :component="VerticalAlignBottomOutlined" />
            </template>
          </n-button>

          <n-tabs
            v-model:value="activeTab"
            type="card"
            size="small"
            class="tabs"
          >
            <n-tab :name="0">编辑</n-tab>
            <n-tab :name="1">预览</n-tab>
          </n-tabs>

          <div class="toolbar-wrapper">
            <n-flex
              v-show="activeTab === 0"
              :size="0"
              align="center"
              :wrap="false"
            >
              <n-divider vertical />
              <MarkdownToolbar
                :el-textarea="elEditor?.elTextarea"
                :drafts="elEditor?.drafts ?? []"
                dropdown-placement="top-start"
                @clear-draft="elEditor?.clearDraft()"
              />
            </n-flex>
          </div>
        </n-flex>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticky-bottom-tab {
  position: fixed;
  bottom: 0;
  left: v-bind(stickyBarLeftOffset);
  right: 0;
  z-index: 1;
  pointer-events: none;
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fold-button-fixed {
  position: absolute;
  bottom: 6px;
  left: 16px;
  pointer-events: auto;
  z-index: 10;
}

@media only screen and (max-width: 600px) {
  .fold-button-fixed {
    left: 4px;
  }
}

.sliding-container {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.sliding-container.collapsed {
  transform: translateY(100%);
}

.sliding-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--tab-color);
  opacity: 0.8;
  z-index: -1;
}

.sticky-bottom-tab .container {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  padding: 0 16px 0 56px;
  height: 42px;
}

.sticky-bottom-tab .content {
  flex: 1;
}

.toolbar-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
}

.sticky-bottom-tab .tabs {
  width: auto;
  margin-left: 8px;
}

.sticky-bottom-tab .tabs :deep(.n-tabs-nav) {
  background-color: transparent !important;
  border-bottom: none !important;
}

.sticky-bottom-tab .tabs :deep(.n-tabs-tab) {
  background-color: transparent !important;
}

@media only screen and (max-width: 600px) {
  .sticky-bottom-tab .container {
    padding-left: 44px;
    padding-right: 4px;
  }
}
</style>
