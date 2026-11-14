<script lang="ts" setup>
import ULink from '@nuxt/ui/components/Link.vue';
import { XTime } from '@novelia/web-kit';

import type { ReadableTocItem } from '@/pages/novel/components/common';

const props = defineProps<{
  providerId: string;
  novelId: string;
  tocItem: ReadableTocItem;
  lastRead?: string;
  isSeparator: boolean;
  isSpecialChapter?: boolean;
}>();

const type = computed(() => {
  const { tocItem, lastRead } = props;
  if (tocItem.chapterId === undefined) {
    return undefined;
  } else {
    const isLastReader =
      lastRead !== undefined && tocItem.chapterId === lastRead;
    if (isLastReader) {
      return 'warning';
    } else {
      return 'success';
    }
  }
});
</script>

<template>
  <component
    :is="!isSeparator ? ULink : 'div'"
    :to="
      !isSeparator
        ? `/novel/${providerId}/${novelId}/${tocItem.chapterId}`
        : undefined
    "
    class="toc group block w-[calc(100%-24px)]"
    :class="
      isSeparator
        ? 'cursor-pointer px-1.5 py-0 text-[12px]'
        : 'cursor-default px-3 py-1 text-[14px]'
    "
  >
    <div
      class="flex items-center justify-between"
      :id="isSpecialChapter ? undefined : `chapterTocItem-${tocItem.chapterId}`"
    >
      <div>
        <span
          :class="{
            'toc-title-visited': type !== undefined && type !== 'warning',
            'group-hover:underline': type !== undefined,
            'text-warning': type === 'warning',
            'text-success': type === 'success',
            'text-default': type === undefined,
          }"
        >
          {{ tocItem.titleJp }}
        </span>
        <br />
        <span class="text-muted">
          {{ tocItem.titleZh }}
        </span>
        <br />
        <span class="text-muted text-[12px]" v-if="!isSeparator">
          [{{ tocItem.order }}]
          <XTime
            v-if="tocItem.createAt"
            :time="tocItem.createAt * 1000"
            format="yyyy-MM-dd HH:mm"
          />
        </span>
      </div>
    </div>
  </component>
</template>

<style scoped>
.toc:visited .toc-title-visited {
  color: color-mix(in srgb, var(--ui-primary) 50%, red);
}
</style>
