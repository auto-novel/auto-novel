<script lang="ts" setup>
import { NCollapse, NCollapseItem, NVirtualList } from 'naive-ui';
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

const sortedChapters = (chapters: ReadableTocItem[]) => {
  return props.sortReverse ? chapters.slice().reverse() : chapters;
};

const sortedSections = computed(() => {
  const sections = props.tocSections;
  return props.sortReverse ? sections.slice().reverse() : sections;
});

const noNeedScroll = computed(() => {
  return props.mode.narrow && !props.mode.modal && !props.mode.collapse;
});

const noSeparator = computed(() => {
  return (
    props.tocSections.length === 1 && props.tocSections[0].separator === null
  );
});

const scrollToLastRead = async () => {
  if (noNeedScroll.value || noSeparator.value || !props.lastReadChapterId) {
    return;
  }

  await nextTick();

  const elementId = `chapterTocItem-${props.lastReadChapterId}`;
  let element: HTMLElement | null = null;

  for (let i = 0; i < 5; i++) {
    element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100 + i * 50));
  }
};

onMounted(() => {
  scrollToLastRead();
});

const noSeparatorClass = computed(() => {
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
    v-if="noSeparator"
    :items="sortedChapters(props.tocSections[0].chapters)"
    :item-size="75.2"
    :default-scroll-key="defaultScrollKey"
    style="overflow: auto"
    :class="noSeparatorClass"
    :scrollbar-props="{ trigger: 'none' }"
    item-resizable
  >
    <template #default="{ item: chapter }">
      <div :key="chapter.chapterId">
        <ChapterTocItem
          :provider-id="providerId"
          :novel-id="novelId"
          :toc-item="chapter"
          :last-read="lastReadChapterId"
          :is-separator="false"
          @click="handleItemClick(chapter)"
        />
      </div>
    </template>
  </n-virtual-list>
  <n-collapse
    v-else
    :expanded-names="expandedNames"
    @update:expanded-names="$emit('update:expandedNames', $event)"
    arrow-placement="right"
  >
    <template v-for="(section, index) in sortedSections" :key="index">
      <n-collapse-item
        v-if="section.separator"
        :name="section.separator.titleJp"
        display-directive="show"
      >
        <template #header>
          <ChapterTocItem
            :provider-id="providerId"
            :novel-id="novelId"
            :toc-item="section.separator"
            :is-separator="true"
            style="width: 100%"
          />
        </template>
        <n-virtual-list
          v-if="section.chapters.length > 0"
          :items="sortedChapters(section.chapters)"
          :item-size="75.2"
          :scrollbar-props="{ trigger: 'none' }"
          item-resizable
        >
          <template #default="{ item: chapter }">
            <div :key="`ch-${chapter.chapterId}`">
              <ChapterTocItem
                :provider-id="providerId"
                :novel-id="novelId"
                :toc-item="chapter"
                :last-read="lastReadChapterId"
                :is-separator="false"
                @click="handleItemClick(chapter)"
              />
            </div>
          </template>
        </n-virtual-list>
      </n-collapse-item>
      <n-virtual-list
        v-else-if="section.chapters.length > 0"
        :items="sortedChapters(section.chapters)"
        :item-size="75.2"
        :scrollbar-props="{ trigger: 'none' }"
        item-resizable
      >
        <template #default="{ item: chapter }">
          <div :key="`ch-${chapter.chapterId}`">
            <ChapterTocItem
              :provider-id="providerId"
              :novel-id="novelId"
              :toc-item="chapter"
              :last-read="lastReadChapterId"
              :is-separator="false"
              @click="handleItemClick(chapter)"
            />
          </div>
        </template>
      </n-virtual-list>
    </template>
  </n-collapse>
</template>
<style scoped>
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
