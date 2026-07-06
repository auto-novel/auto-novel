<script setup lang="ts">
import {
  KeyboardArrowDownOutlined,
  KeyboardArrowUpOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from '@vicons/material';

import { useBreakPoints } from '@/pages/util';
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

const bp = useBreakPoints();
const hasSider = bp.greater('tablet');
const menuShowTrigger = bp.greater('desktop');
const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const menuCollapsed = computed(() => {
  if (menuShowTrigger.value) {
    return setting.value.menuCollapsed;
  } else {
    return true;
  }
});

const stickyBarLeftOffset = computed(() => {
  if (!hasSider.value) return '0';
  return menuCollapsed.value ? '64px' : '240px';
});

const isCollapsed = useLocalStorage('markdown-editor-collapsed', {
  collapsed: false,
});

const showActions = ref(true);

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
  if (isCollapsed.value.collapsed) {
    showActions.value = true;
  }
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
      <transition name="actions">
        <div class="right-actions-wrapper" v-show="showActions">
          <slot name="right-actions" />
        </div>
      </transition>

      <div class="container">
        <div class="toolbar-row" v-show="activeTab === 0">
          <n-divider vertical class="desktop-divider" />
          <div class="toolbar-content">
            <MarkdownToolbar
              :el-textarea="elEditor?.elTextarea"
              :drafts="elEditor?.drafts ?? []"
              dropdown-placement="top-start"
              @clear-draft="elEditor?.clearDraft()"
            />
          </div>
        </div>
        <div class="management-row">
          <n-flex class="content" align="center" :wrap="false" :size="12">
            <n-flex :size="0">
              <n-button
                quaternary
                size="small"
                title="最上"
                @click="scrollToTop"
              >
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
            </n-flex>

            <n-tabs
              v-model:value="activeTab"
              type="card"
              size="small"
              class="tabs"
            >
              <n-tab :name="0">编辑</n-tab>
              <n-tab :name="1">预览</n-tab>
            </n-tabs>

            <template v-if="!hasSider">
              <div style="flex: 1" />
              <n-button
                quaternary
                size="small"
                :title="showActions ? '隐藏提交' : '显示提交'"
                style="margin-right: 8px"
                @click="showActions = !showActions"
              >
                <template #icon>
                  <n-icon
                    :component="
                      showActions ? VisibilityOffOutlined : VisibilityOutlined
                    "
                  />
                </template>
              </n-button>
            </template>
          </n-flex>
        </div>
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

.right-actions-wrapper {
  position: absolute;
  bottom: calc(100% + 16px);
  right: 16px;
  pointer-events: auto;
}

.actions-enter-active,
.actions-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.actions-enter-from,
.actions-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.sticky-bottom-tab .container {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  padding: 0 16px 0 56px;
  min-height: 42px;
}

.toolbar-row {
  order: 2;
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.toolbar-content {
  flex: 1;
  display: flex;
  align-items: center;
  overflow-x: auto;
}

.management-row {
  order: 1;
}

.sticky-bottom-tab .content {
  flex: 1;
}

.sticky-bottom-tab .tabs {
  width: auto;
  /* margin-left: 8px; */
}

.sticky-bottom-tab .tabs :deep(.n-tabs-nav) {
  background-color: transparent !important;
  border-bottom: none !important;
}

.sticky-bottom-tab .tabs :deep(.n-tabs-tab) {
  background-color: transparent !important;
}

@media only screen and (max-width: 540px) {
  .sticky-bottom-tab .container {
    padding-left: 12px;
    padding-right: 4px;
    flex-direction: column;
    align-items: stretch;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .toolbar-row {
    order: 1;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }

  .management-row {
    order: 2;
    padding-left: 38px;
  }

  .desktop-divider {
    display: none;
  }

  .fold-button-fixed {
    bottom: 10px;
    left: 4px;
  }
}
</style>
