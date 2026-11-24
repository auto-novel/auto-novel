<script lang="ts" setup>
import UScrollArea from '@nuxt/ui/components/ScrollArea.vue';
import { KeyboardArrowDownRound } from '@vicons/material';
import { useResizeObserver } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { checkIsMobile } from '@/util';

import type { TocChapter, TocItem } from './useChapterToc';

const props = withDefaults(
  defineProps<{
    items: TocItem[];
    chapterTo: (chapter: TocChapter) => string;
    currentChapterId?: string;
    initialChapterId?: string;
    virtual?: boolean;
    padded?: boolean;
  }>(),
  {
    virtual: true,
    padded: false,
  },
);
const emit = defineEmits<{
  toggleSection: [key: string];
  select: [chapter: TocChapter];
}>();

// 只使用 UScrollArea 公开的实例接口，不再访问滚动条内部实现。
const listRef = ref<{
  $el: HTMLElement;
  virtualizer?: {
    scrollElement: HTMLElement | null;
    measure: () => void;
    scrollToIndex: (index: number, options: { align: 'center' }) => void;
  };
}>();
let initiallyPositioned = false;

const virtualOptions = computed(() => ({
  estimateSize: 76,
  ...(checkIsMobile() ? {} : { overscan: 100 }),
  // 留白属于滚动内容，必须计入虚拟列表的偏移和总高度。
  paddingStart: props.padded ? 16 : 0,
  paddingEnd: 24,
  getItemKey: (index: number) => props.items[index]!.key,
}));

let positioningFrame: number | undefined;
let disposed = false;
const cancelPositioning = () => {
  if (positioningFrame !== undefined) cancelAnimationFrame(positioningFrame);
  positioningFrame = undefined;
};
const positionInitially = () => {
  cancelPositioning();
  if (disposed || initiallyPositioned || props.initialChapterId === undefined)
    return;
  // 组件 ref 可用时，虚拟列表不一定已绑定滚动元素或完成测量。
  // 有限重试等待就绪，测量后的居中校正交给虚拟列表处理。
  let attempts = 0;
  const position = () => {
    positioningFrame = undefined;
    const list = listRef.value;
    const index = props.items.findIndex(
      (item) =>
        item.kind === 'chapter' && item.chapterId === props.initialChapterId,
    );
    if (!list?.virtualizer || index < 0) return;
    const root = list.$el;
    if (root?.clientHeight && list.virtualizer.scrollElement === root) {
      list.virtualizer.scrollToIndex(index, { align: 'center' });
      initiallyPositioned = true;
      return;
    }
    if (++attempts < 30) positioningFrame = requestAnimationFrame(position);
  };
  positioningFrame = requestAnimationFrame(position);
};

watch(
  listRef,
  () => {
    initiallyPositioned = false;
    positionInitially();
  },
  { flush: 'post' },
);
onBeforeUnmount(() => {
  disposed = true;
  cancelPositioning();
});
watch(
  () => props.items,
  async () => {
    // 等长倒序也必须失效缓存，不能只依赖 count 或 getItemKey 的闭包变化。
    listRef.value?.virtualizer?.measure();
    await nextTick();
    positionInitially();
  },
  { flush: 'post' },
);
watch(() => props.initialChapterId, positionInitially, { flush: 'post' });
useResizeObserver(() => listRef.value?.$el, positionInitially);
</script>

<template>
  <UScrollArea
    :key="virtual ? 'virtual' : 'flow'"
    ref="listRef"
    as="nav"
    aria-label="章节目录"
    :items="items"
    :virtualize="virtual ? virtualOptions : false"
    :class="{ 'overflow-visible': !virtual }"
    :ui="{
      viewport: virtual ? '' : padded ? 'pt-4 pb-6' : 'pb-6',
      item: [
        padded && 'pl-2 pr-4',
        !virtual &&
          '[content-visibility:auto] [contain-intrinsic-size:auto_76px]',
      ],
    }"
  >
    <template #default="{ item, index }">
      <button
        v-if="item.kind === 'section'"
        type="button"
        class="flex min-h-14 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] text-default focus-visible:outline-2 focus-visible:outline-primary"
        :class="{ 'border-t border-default': index > 0 }"
        :aria-expanded="item.expanded"
        @click="emit('toggleSection', item.key)"
      >
        <span class="min-w-0 flex-1 break-words">
          {{ item.titleJp }}
          <span v-if="item.titleZh" class="block text-muted">
            {{ item.titleZh }}
          </span>
        </span>
        <KeyboardArrowDownRound
          class="size-4.5 shrink-0"
          aria-hidden="true"
          :class="{ 'rotate-180': item.expanded }"
        />
      </button>
      <ChapterTocItem
        v-else
        :item="item"
        :to="chapterTo(item)"
        :current-chapter-id="currentChapterId"
        @click="emit('select', item)"
      />
    </template>
  </UScrollArea>
</template>
