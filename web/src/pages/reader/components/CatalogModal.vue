<script lang="ts" setup>
import {
  KeyboardArrowDownRound,
  KeyboardArrowUpRound,
  SortOutlined,
} from '@vicons/material';

import type { GenericNovelId } from '@/model/Common';
import type { ReadableTocItem } from '@/pages/novel/components/common';
import { useTocExpansion } from '@/pages/novel/components/UseTocExpansion';
import { useIsWideScreen } from '@/pages/util';
import { WebNovelRepo } from '@/repos';
import { useLocalVolumeStore, useSettingStore } from '@/stores';
import type { Result } from '@/util/result';
import { Err, Ok, runCatching } from '@/util/result';

const props = defineProps<{
  show: boolean;
  gnid: GenericNovelId;
  chapterId: string;
}>();

const emit = defineEmits<{
  'update:show': [boolean];
}>();

type TocItem = ReadableTocItem & {
  key: number;
};

const tocResult = shallowRef<Result<TocItem[]>>();

const tocData = computed(() =>
  tocResult.value?.ok ? tocResult.value.value : undefined,
);

const tocNumber = computed(() => {
  return tocData.value?.filter((it) => it.chapterId !== undefined).length;
});

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const sortReverse = computed(() => setting.value.tocSortReverse);

const isWideScreen = useIsWideScreen();

const defaultTocExpanded = computed(() => setting.value.tocExpandAll);

const { expandedNames, hasSeparators, isAnyExpanded, toggleAll, tocSections } =
  useTocExpansion(
    tocData,
    defaultTocExpanded,
    computed(() => props.chapterId),
  );

watch(
  () => props.show,
  async (show) => {
    if (show) {
      if (tocResult.value?.ok !== true) {
        const getWebToc = async (providerId: string, novelId: string) => {
          const { data: novel } = await WebNovelRepo.useWebNovel(
            providerId,
            novelId,
          ).refresh();
          if (novel) {
            let order = 0;
            const tocItems = novel.toc.map((it, index) => {
              const tocItem = <TocItem>{
                ...it,
                key: index,
                order: it.chapterId ? order : undefined,
              };
              if (it.chapterId) order += 1;
              return tocItem;
            });
            return Ok(tocItems);
          } else {
            return Err('载入失败');
          }
        };

        const getLocalToc = async (volumeId: string) => {
          const repo = await useLocalVolumeStore();
          const volume = await repo.getVolume(volumeId);
          if (volume === undefined) throw Error('小说不存在');
          return volume.toc.map(
            (it, index) =>
              <TocItem>{
                titleJp: it.chapterId,
                chapterId: it.chapterId,
                key: index,
              },
          );
        };

        const gnid = props.gnid;
        if (gnid.type === 'web') {
          tocResult.value = await getWebToc(gnid.providerId, gnid.novelId);
        } else if (gnid.type === 'wenku') {
          throw '不支持文库';
        } else {
          tocResult.value = await runCatching(getLocalToc(gnid.volumeId));
        }
      }
    }
  },
);

const currentKey = computed(() => {
  return tocData.value?.find((it) => it.chapterId === props.chapterId)?.key;
});

const onTocItemClick = (item: ReadableTocItem) => {
  if (item.chapterId !== undefined) {
    emit('update:show', false);
  }
};
</script>

<template>
  <c-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    content-scrollable
    style="min-height: 30vh; max-height: 80vh"
    content-style="overflow: auto;"
  >
    <template #header>
      <div style="display: flex; align-items: baseline">
        <span>目录</span>
        <n-text
          v-if="tocNumber !== undefined"
          depth="3"
          style="font-size: 12px; margin-left: 12px"
        >
          共{{ tocNumber }}章
        </n-text>
        <div style="flex: 1" />
        <c-button
          v-if="hasSeparators"
          :label="isAnyExpanded ? '折叠' : '展开'"
          :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
          quaternary
          size="small"
          :round="false"
          @action="toggleAll"
          style="margin-right: 8px"
        />
        <c-button
          :label="setting.tocSortReverse ? '倒序' : '正序'"
          :icon="SortOutlined"
          quaternary
          size="small"
          :round="false"
          @action="setting.tocSortReverse = !setting.tocSortReverse"
        />
      </div>
    </template>

    <c-result :result="tocResult">
      <ChapterTocList
        v-if="gnid.type === 'web' && tocSections"
        :toc-sections="tocSections"
        v-model:expanded-names="expandedNames"
        :last-read-chapter-id="chapterId"
        :default-scroll-key="currentKey"
        :provider-id="gnid.providerId"
        :novel-id="gnid.novelId"
        :sort-reverse="sortReverse"
        :mode="{
          narrow: !isWideScreen,
          modal: true,
          collapse: false,
        }"
        @item-click="onTocItemClick"
        style="height: 100%"
      />
      <ChapterTocList
        v-else-if="gnid.type === 'local' && tocSections"
        :toc-sections="tocSections"
        v-model:expanded-names="expandedNames"
        :last-read-chapter-id="chapterId"
        :default-scroll-key="currentKey"
        :provider-id="gnid.volumeId"
        :novel-id="gnid.volumeId"
        :sort-reverse="sortReverse"
        :mode="{
          narrow: !isWideScreen,
          modal: true,
          collapse: false,
        }"
        @item-click="onTocItemClick"
        style="height: 100%"
      />
    </c-result>
  </c-modal>
</template>
