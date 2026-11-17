<script lang="ts" setup>
import type { TocChapter } from '@/components/useChapterToc';
import { useChapterToc } from '@/components/useChapterToc';
import { GenericNovelId } from '@/model/Common';
import type { WebNovelTocItemDto } from '@/model/WebNovel';
import { WebNovelRepo } from '@/repos';
import { useLocalVolumeStore, useSettingStore } from '@/stores';
import type { Result } from '@/util/result';
import { runCatching } from '@/util/result';

const props = defineProps<{
  show: boolean;
  gnid: GenericNovelId;
  chapterId: string;
}>();
const emit = defineEmits<{ 'update:show': [boolean] }>();
const { setting } = storeToRefs(useSettingStore());
const tocResult = shallowRef<Result<WebNovelTocItemDto[]>>();
const tocData = computed(() =>
  tocResult.value?.ok ? tocResult.value.value : undefined,
);
const {
  items,
  visibleItems,
  hasSections,
  isAnyExpanded,
  toggleAll,
  toggleSection,
} = useChapterToc(tocData, {
  defaultExpanded: () => setting.value.tocExpandAll,
  currentChapterId: () => props.chapterId,
  sortReverse: () => setting.value.tocSortReverse,
});
const chapterCount = computed(
  () => items.value.filter((item) => item.kind === 'chapter').length,
);

let loadedFor: string | undefined;
watch(
  [() => props.show, () => GenericNovelId.toString(props.gnid)],
  async ([show, identity], _previous, onCleanup) => {
    if (identity !== loadedFor) {
      loadedFor = identity;
      tocResult.value = undefined;
    }
    if (!show || tocResult.value?.ok) return;
    let active = true;
    onCleanup(() => (active = false));
    const gnid = props.gnid;
    const result = await runCatching(
      (async (): Promise<WebNovelTocItemDto[]> => {
        if (gnid.type === 'web') {
          const { data: novel } = await WebNovelRepo.useWebNovel(
            gnid.providerId,
            gnid.novelId,
          ).refresh();
          if (!novel) throw Error('载入失败');
          return novel.toc;
        }
        if (gnid.type !== 'local') throw Error('不支持文库');
        const repo = await useLocalVolumeStore();
        const volume = await repo.getVolume(gnid.volumeId);
        if (!volume) throw Error('小说不存在');
        return volume.toc.map((item) => ({
          titleJp: item.chapterId,
          chapterId: item.chapterId,
        }));
      })(),
    );
    if (active) tocResult.value = result;
  },
  { immediate: true },
);

const chapterTo = (chapter: TocChapter) => {
  const gnid = props.gnid;
  if (gnid.type === 'web') {
    return `/novel/${gnid.providerId}/${gnid.novelId}/${chapter.chapterId}`;
  }
  if (gnid.type === 'local') {
    return `/workspace/reader/${encodeURIComponent(gnid.volumeId)}/${encodeURIComponent(chapter.chapterId)}`;
  }
  return '';
};
</script>

<template>
  <UModal
    :open="show"
    @update:open="emit('update:show', $event)"
    class="w-150"
    :ui="{
      content: 'min-h-[30vh] max-h-[80dvh] max-w-[calc(100vw-2rem)]',
      body: 'overflow-hidden',
    }"
  >
    <template #title>
      <div class="flex items-baseline gap-3 pr-2">
        <span>目录</span>
        <span v-if="tocData" class="text-muted text-[12px]">
          共{{ chapterCount }}章
        </span>
        <div class="flex-1" />
        <ChapterTocToolbar
          v-model:reverse="setting.tocSortReverse"
          :has-sections="hasSections"
          :is-any-expanded="isAnyExpanded"
          @toggle-all="toggleAll"
        />
      </div>
    </template>
    <template #body>
      <div v-if="!tocResult" role="status">
        <span class="sr-only">正在加载章节目录…</span>
        <div aria-hidden="true" class="divide-y divide-default">
          <div v-for="index in 8" :key="index" class="py-3">
            <USkeleton class="h-5" :class="index % 3 ? 'w-4/5' : 'w-3/5'" />
            <USkeleton class="mt-2 h-4 w-1/2" />
          </div>
        </div>
      </div>
      <UAlert
        v-else-if="!tocResult.ok"
        color="error"
        variant="soft"
        title="加载错误"
        :description="tocResult.error.message"
      />
      <ChapterTocList
        v-else
        :items="visibleItems"
        :chapter-to="chapterTo"
        :current-chapter-id="chapterId"
        :initial-chapter-id="chapterId"
        class="h-[max(56px,calc(80dvh-200px))]"
        @toggle-section="toggleSection"
        @select="emit('update:show', false)"
      />
    </template>
  </UModal>
</template>
