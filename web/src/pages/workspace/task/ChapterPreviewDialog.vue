<script lang="ts" setup>
import { XDialog } from '@novelia/web-kit';

import type { ChapterSegmentState } from '@/domain/translator/TaskState';

const props = defineProps<{
  show: boolean;
  title: string;
  chapterState: ChapterSegmentState | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
}>();

const selectedSegmentIndex = ref(0);
const previewState = computed(() => {
  const state = props.chapterState;
  const seg = state?.segments[selectedSegmentIndex.value] ?? null;
  const paragraphs: { jp: string; zh: string }[] = [];
  if (seg) {
    const maxLen = Math.max(seg.lines.length, seg.translatedLines.length);
    for (let i = 0; i < maxLen; i++) {
      paragraphs.push({
        jp: seg.lines[i] ?? '',
        zh: seg.translatedLines[i] ?? '',
      });
    }
  }

  const errorMsg =
    seg && seg.status === 'error'
      ? state?.getSegmentError(selectedSegmentIndex.value)
      : undefined;

  return {
    translatorId: seg?.translatorId,
    currentSegment: seg,
    previewParagraphs: paragraphs,
    currentSegmentError: errorMsg,
    segmentStatuses: state
      ? state.segments.map((s) => s?.status ?? 'pending')
      : [],
    previewProgressStatus:
      state && state.segments.length > 0
        ? {
            total: state.segments.length,
            success: state.completedCount,
            processing: state.translatingCount,
            failed: state.errorCount,
          }
        : null,
    ranges: state?.ranges ?? [],
  };
});

const segmentBtnType = (
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  switch (status) {
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    case 'translating':
      return 'info';
    default:
      return 'default';
  }
};

const getSegmentError = (index: number): string | undefined => {
  return props.chapterState?.getSegmentError(index);
};

const selectSegment = (index: number) => {
  selectedSegmentIndex.value = index;
};

const onUpdateShow = (val: boolean) => {
  if (!val) {
    selectedSegmentIndex.value = 0;
  }
  emit('update:show', val);
};
</script>

<template>
  <XDialog
    :open="show"
    @update:open="onUpdateShow"
    :title="title"
    class="w-[min(900px,95vw)]"
  >
    <n-alert
      v-if="chapterState?.errorMessage"
      type="error"
      title="章节处理失败"
      :bordered="false"
    >
      <pre
        class="m-0 font-mono text-[13px]/[1.5] whitespace-pre-wrap break-all"
        >{{ chapterState.errorMessage }}</pre
      >
    </n-alert>
    <div>
      <div v-if="previewState.previewProgressStatus" class="flex gap-2">
        <n-tag size="small" :bordered="false">
          共 {{ previewState.previewProgressStatus.total }}
        </n-tag>
        <n-tag size="small" :bordered="false" type="success">
          ✓ {{ previewState.previewProgressStatus.success }}
        </n-tag>
        <n-tag size="small" :bordered="false" type="info">
          ● {{ previewState.previewProgressStatus.processing }}
        </n-tag>
        <n-tag size="small" :bordered="false" type="error">
          ✕ {{ previewState.previewProgressStatus.failed }}
        </n-tag>
      </div>
      <n-divider class="mx-0! my-1!" />
    </div>

    <div
      v-if="previewState.ranges.length > 1"
      class="flex flex-wrap gap-1 px-0.5 py-2"
    >
      <n-button
        v-for="(range, i) of previewState.ranges"
        :key="i"
        size="small"
        secondary
        :type="segmentBtnType(previewState.segmentStatuses[i])"
        :title="getSegmentError(i) ?? range.end - range.start + '行'"
        class="aspect-square min-w-0! px-0!"
        :class="{
          'outline-2! outline-offset-1 outline-primary!':
            selectedSegmentIndex === i,
        }"
        @click="selectSegment(i)"
      >
        {{ i + 1 }}
      </n-button>
    </div>
    <div
      class="px-0.5 py-1 text-[0.85em] opacity-60"
      v-if="previewState.translatorId"
    >
      翻译器：{{ previewState.translatorId }}
    </div>
    <n-alert
      v-if="previewState.currentSegmentError"
      type="error"
      title="翻译出错"
      :bordered="false"
    >
      <pre
        class="m-0 font-mono text-[13px]/[1.5] whitespace-pre-wrap break-all"
        >{{ previewState.currentSegmentError }}</pre
      >
    </n-alert>

    <n-table :bordered="false" size="small" class="mt-2 table-fixed">
      <thead class="[@media(max-width:768px)]:hidden">
        <tr
          :class="[
            '[@media(max-width:768px)]:mb-2.5 [@media(max-width:768px)]:block',
            '[@media(max-width:768px)]:border-b [@media(max-width:768px)]:border-divider',
            '[@media(max-width:768px)]:pb-2',
          ]"
        >
          <th class="w-1/2">原文</th>
          <th class="w-1/2">译文</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(p, i) of previewState.previewParagraphs"
          :key="i"
          :class="[
            '[@media(max-width:768px)]:mb-2.5 [@media(max-width:768px)]:block',
            '[@media(max-width:768px)]:border-b [@media(max-width:768px)]:border-divider',
            '[@media(max-width:768px)]:pb-2',
          ]"
        >
          <td
            :class="[
              'align-top leading-[1.7]',
              '[@media(max-width:768px)]:block [@media(max-width:768px)]:w-full!',
              '[@media(max-width:768px)]:border-0! [@media(max-width:768px)]:px-2!',
              '[@media(max-width:768px)]:py-0.75! [@media(max-width:768px)]:font-medium',
            ]"
          >
            {{ p.jp }}
          </td>
          <td
            :class="[
              'align-top leading-[1.7]',
              '[@media(max-width:768px)]:block [@media(max-width:768px)]:w-full!',
              '[@media(max-width:768px)]:border-0! [@media(max-width:768px)]:px-2!',
              '[@media(max-width:768px)]:py-0.75! [@media(max-width:768px)]:opacity-60',
            ]"
          >
            <template v-if="p.zh">{{ p.zh }}</template>
            <span v-else-if="p.jp" class="opacity-50">（无译文）</span>
          </td>
        </tr>
      </tbody>
    </n-table>
  </XDialog>
</template>
