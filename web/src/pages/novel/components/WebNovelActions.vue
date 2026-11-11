<script lang="ts" setup>
import { BookOutlined, EditNoteOutlined } from '@vicons/material';
import type { WebNovelDto } from '@/model/WebNovel';
import { useWhoamiStore } from '@/stores';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);
const startReadChapter = computed(() => {
  const { novel } = props;
  if (novel.lastReadChapterId !== undefined) {
    const lastReadChapter = novel.toc.find(
      (it) => it.chapterId === novel.lastReadChapterId,
    );
    if (lastReadChapter !== undefined) {
      return { chapter: lastReadChapter, type: 'continue' as const };
    }
  }

  const firstChapter = novel.toc.find((it) => it.chapterId !== undefined);
  if (firstChapter !== undefined) {
    return { chapter: firstChapter, type: 'first' as const };
  }

  return undefined;
});
</script>

<template>
  <div class="flex flex-wrap justify-start gap-x-3 gap-y-2">
    <UButton
      v-if="startReadChapter !== undefined"
      :to="`/novel/${providerId}/${novelId}/${startReadChapter.chapter.chapterId}`"
      color="primary"
      variant="soft"
    >
      {{ startReadChapter.type === 'continue' ? '继续阅读' : '开始阅读' }}
    </UButton>
    <UButton color="neutral" variant="outline" v-else disabled>
      开始阅读
    </UButton>

    <FavoriteButton
      :favored="novel.favored"
      :novel="{ type: 'web', providerId, novelId }"
    />

    <UButton
      v-if="whoami.hasNovelAccess"
      :to="`/novel-edit/${providerId}/${novelId}`"
      color="neutral"
      variant="outline"
    >
      <component
        :is="EditNoteOutlined"
        class="size-4.5 shrink-0"
        aria-hidden="true"
      />
      编辑
    </UButton>

    <UButton
      v-if="novel.wenkuId"
      :to="`/wenku/${novel.wenkuId}`"
      color="neutral"
      variant="outline"
    >
      <component
        :is="BookOutlined"
        class="size-4.5 shrink-0"
        aria-hidden="true"
      />
      文库
    </UButton>
  </div>
</template>
