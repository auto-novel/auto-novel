<script lang="ts" setup>
import ULink from '@nuxt/ui/components/Link.vue';
import { XTime } from '@novelia/web-kit';

import type { TocChapter } from './useChapterToc';

defineProps<{
  item: TocChapter;
  to: string;
  currentChapterId?: string;
}>();
</script>

<template>
  <ULink
    :to="to"
    :aria-current="item.chapterId === currentChapterId ? 'location' : undefined"
    class="toc group block min-h-14 w-full px-3 py-1 text-left text-[14px] break-words"
  >
    <span
      class="group-hover:underline"
      :class="
        item.chapterId === currentChapterId
          ? 'text-warning'
          : 'toc-title-visited text-success'
      "
    >
      {{ item.titleJp }}
    </span>
    <br />
    <span class="text-muted">{{ item.titleZh }}</span>
    <br />
    <span class="text-muted text-[12px]">
      [{{ item.order }}]
      <XTime
        v-if="item.createAt"
        :time="item.createAt * 1000"
        format="yyyy-MM-dd HH:mm"
      />
    </span>
  </ULink>
</template>

<style scoped>
.toc:visited .toc-title-visited {
  color: color-mix(in srgb, var(--ui-primary) 50%, red);
}
</style>
