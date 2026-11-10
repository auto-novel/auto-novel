<script lang="ts" setup>
import type { WebNovelChapterDto } from '@/model/WebNovel';
import {
  FormatListBulletedOutlined,
  LibraryBooksOutlined,
  TuneOutlined,
  ArrowUpwardOutlined,
  ArrowDownwardOutlined,
} from '@vicons/material';

defineProps<{
  novelUrl?: string;
  chapter: WebNovelChapterDto;
}>();

const emit = defineEmits<{
  nav: [string];
  requireCatalogModal: [];
  requireSettingModal: [];
}>();

const router = useRouter();
</script>

<template>
  <div class="flex flex-nowrap justify-start gap-x-3 gap-y-2">
    <div style="flex: auto">
      <slot />
    </div>

    <div style="flex: 0 0 0">
      <div
        class="fixed bottom-5 flex flex-col flex-nowrap justify-start gap-x-4 gap-y-3"
      >
        <side-button
          :disabled="!chapter.prevId"
          text="上一章"
          :icon="ArrowUpwardOutlined"
          @click="emit('nav', chapter.prevId!)"
        />
        <side-button
          :disabled="!chapter.nextId"
          text="下一章"
          :icon="ArrowDownwardOutlined"
          @click="emit('nav', chapter.nextId!)"
        />
        <side-button
          v-if="novelUrl"
          text="详情"
          :icon="LibraryBooksOutlined"
          @click="router.push(novelUrl)"
        />
        <side-button
          text="目录"
          :icon="FormatListBulletedOutlined"
          @click="emit('requireCatalogModal')"
        />
        <side-button
          text="设置"
          :icon="TuneOutlined"
          @click="emit('requireSettingModal')"
        />
      </div>
    </div>
  </div>
</template>
