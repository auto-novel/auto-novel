<script lang="ts" setup>
import { KeyboardArrowDownRound } from '@vicons/material';
import { useResizeObserver } from '@vueuse/core';
import { NIcon, NVirtualList, useThemeVars } from 'naive-ui';
import type { ReadableTocItem } from '@/pages/novel/components/common';

interface TocSection {
  separator: ReadableTocItem | null;
  chapters: ReadableTocItem[];
}

const props = defineProps<{
  tocSections: TocSection[];
  expandedNames: string[];
  lastReadChapterId?: string;
  defaultScrollKey?: number;
  providerId: string;
  novelId: string;
  sortReverse: boolean;
  mode: {
    narrow: boolean;
    modal: boolean;
    collapse: boolean;
  };
}>();

const emit = defineEmits<{
  'update:expandedNames': [string[]];
  itemClick: [ReadableTocItem];
}>();

const handleItemClick = (item: ReadableTocItem) => {
  if (item.chapterId !== undefined) {
    emit('itemClick', item);
  }
};

const vars = useThemeVars();

const expandedSet = computed(() => new Set(props.expandedNames));

const toggleSection = (name: string) => {
  const names = props.expandedNames;
  emit(
    'update:expandedNames',
    expandedSet.value.has(name)
      ? names.filter((it) => it !== name)
      : [...names, name],
  );
};

// 展平为单个虚拟列表，折叠的分卷不放入章节，只渲染可见部分
const flatItems = computed(() => {
  const reverse = props.sortReverse;
  const sections = reverse
    ? props.tocSections.slice().reverse()
    : props.tocSections;
  const items: ReadableTocItem[] = [];
  for (const { separator, chapters } of sections) {
    if (separator) {
      items.push(separator);
      if (!expandedSet.value.has(separator.titleJp)) continue;
    }
    if (reverse) {
      for (let i = chapters.length - 1; i >= 0; i--) items.push(chapters[i]);
    } else {
      items.push(...chapters);
    }
  }
  return items;
});

// vueuc 的 itemSize 是行高下限：可见行数按 视口高度/itemSize 计算，
// 若有行比它矮（如分卷行），渲染行数不足，列表底部会出现空白
const ITEM_MIN_HEIGHT = 56;

// NVirtualList 只在滚动/容器尺寸变化时同步滚动条，行被测量后内容变高
// 不会触发同步，导致初次加载时滑块比例偏大。这里监听内容高度并手动同步。
const listRef = ref<InstanceType<typeof NVirtualList>>();
useResizeObserver(
  computed(() => listRef.value?.getScrollContent()),
  () => listRef.value?.scrollbarInstRef?.sync(),
);

const virtualListClass = computed(() => {
  if (props.mode.modal) {
    return 'modal-virtual-list';
  }
  if (!props.mode.narrow) {
    return 'wide-virtual-list';
  }
  if (props.mode.collapse) {
    return 'collapse-virtual-list';
  }
  return 'nocollapse-virtual-list';
});
</script>

<template>
  <n-virtual-list
    ref="listRef"
    :items="flatItems"
    :item-size="ITEM_MIN_HEIGHT"
    :default-scroll-key="defaultScrollKey"
    style="overflow: auto"
    :class="virtualListClass"
    :scrollbar-props="{ trigger: 'none' }"
    item-resizable
  >
    <template #default="{ item, index }">
      <div
        v-if="item.order === undefined"
        class="toc-separator-row"
        :class="{ 'toc-separator-divider': index > 0 }"
        @click="toggleSection(item.titleJp)"
      >
        <ChapterTocItem
          :provider-id="providerId"
          :novel-id="novelId"
          :toc-item="item"
          :is-separator="true"
          style="flex: 1"
        />
        <n-icon
          size="18"
          :style="{
            transform: expandedSet.has(item.titleJp)
              ? 'rotate(180deg)'
              : undefined,
          }"
        >
          <KeyboardArrowDownRound />
        </n-icon>
      </div>
      <ChapterTocItem
        v-else
        :provider-id="providerId"
        :novel-id="novelId"
        :toc-item="item"
        :last-read="lastReadChapterId"
        :is-separator="false"
        @click="handleItemClick(item)"
      />
    </template>
  </n-virtual-list>
</template>
<style scoped>
.toc-separator-row {
  box-sizing: border-box;
  min-height: v-bind('ITEM_MIN_HEIGHT + "px"');
  display: flex;
  align-items: center;
  /* 与章节行 calc(100% - 24px) 一致，避免被滚动条遮挡 */
  padding: 8px 12px 8px 0;
  cursor: pointer;
}
.toc-separator-divider {
  border-top: 1px solid v-bind('vars.dividerColor');
}
@supports (height: 100dvh) {
  .modal-virtual-list {
    max-height: calc(80dvh - 200px);
  }
  .wide-virtual-list {
    max-height: calc(100dvh - 150px);
  }
  .collapse-virtual-list {
    max-height: calc(100dvh - 100px);
  }
}
@supports not (height: 100dvh) {
  .modal-virtual-list {
    max-height: calc(80vh - 200px);
  }
  .wide-virtual-list {
    max-height: calc(100vh - 150px);
  }
  .collapse-virtual-list {
    max-height: calc(100vh - 100px);
  }
}
.nocollapse-virtual-list {
  max-height: auto;
}
</style>
