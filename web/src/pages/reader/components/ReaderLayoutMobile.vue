<script lang="ts" setup>
import {
  ArrowBackIosOutlined,
  ArrowForwardIosOutlined,
  FormatListBulletedOutlined,
  LibraryBooksOutlined,
  TuneOutlined,
} from '@vicons/material';

import type { WebNovelChapterDto } from '@/model/WebNovel';
import { useReaderSettingStore } from '@/stores';

const props = defineProps<{
  novelUrl?: string;
  chapter: WebNovelChapterDto;
  modalOpen?: boolean;
}>();

const emit = defineEmits<{
  nav: [string];
  requireCatalogModal: [];
  requireSettingModal: [];
}>();

const showMenu = ref(false);

// 快捷键等外部入口打开弹窗时，也先挂载承载弹窗的菜单内容。
watch(
  () => props.modalOpen,
  (open) => {
    if (open) showMenu.value = true;
  },
  { immediate: true },
);

const readerSettingStore = useReaderSettingStore();
const { readerSetting } = storeToRefs(readerSettingStore);

const onGlobalClick = (event: MouseEvent) => {
  const scrollBy = (y: number) => {
    window.scrollBy({
      top: y * window.innerHeight,
      behavior: readerSetting.value.enableClickAnimition ? 'smooth' : 'instant',
    });
  };

  const scrollByIfNeed = (p: number) => {
    const t = 0.3;
    const distance = 0.8;
    if (p < t) {
      scrollBy(-distance);
    } else if (p > 1 - t) {
      scrollBy(distance);
    } else {
      showMenu.value = true;
    }
  };

  if (
    readerSetting.value.clickArea === 'default' ||
    readerSetting.value.clickArea === 'up-down'
  ) {
    const py = event.clientY / window.innerHeight;
    scrollByIfNeed(py);
  } else if (readerSetting.value.clickArea === 'left-right') {
    const px = event.clientX / window.innerWidth;
    scrollByIfNeed(px);
  } else {
    showMenu.value = true;
  }
};
</script>

<template>
  <div @click="onGlobalClick">
    <slot />
  </div>

  <USlideover
    v-model:open="showMenu"
    title="阅读菜单"
    :close="false"
    side="bottom"
    :content="{ onOpenAutoFocus: (event: Event) => event.preventDefault() }"
    :ui="{ content: 'h-auto max-h-[calc(100dvh-3rem)]' }"
  >
    <template #content>
      <div class="my-1 flex w-full flex-wrap pb-[env(safe-area-inset-bottom)]">
        <div class="flex-[1_1_0px]">
          <side-button
            variant="ghost"
            :disabled="!chapter.prevId"
            text="上一章"
            :icon="ArrowBackIosOutlined"
            @click="emit('nav', chapter.prevId!)"
            class="w-full"
          />
        </div>
        <router-link v-if="novelUrl" :to="novelUrl" class="flex-1">
          <side-button
            variant="ghost"
            text="详情"
            :icon="LibraryBooksOutlined"
            class="w-full"
          />
        </router-link>
        <div class="flex-[1_1_0px]">
          <side-button
            variant="ghost"
            text="目录"
            :icon="FormatListBulletedOutlined"
            @click="emit('requireCatalogModal')"
            class="w-full"
          />
        </div>
        <div class="flex-[1_1_0px]">
          <side-button
            variant="ghost"
            text="设置"
            :icon="TuneOutlined"
            @click="emit('requireSettingModal')"
            class="w-full"
          />
        </div>
        <div class="flex-[1_1_0px]">
          <side-button
            variant="ghost"
            :disabled="!chapter.nextId"
            text="下一章"
            :icon="ArrowForwardIosOutlined"
            @click="emit('nav', chapter.nextId!)"
            class="w-full"
          />
        </div>
      </div>
      <!-- 嵌套声明使弹窗 Portal 排在菜单之后，无需手动分配 z-index。 -->
      <slot name="modals" />
    </template>
  </USlideover>
</template>
