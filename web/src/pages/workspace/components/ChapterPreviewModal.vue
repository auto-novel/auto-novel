<script lang="ts" setup>
import type { ChapterSegmentState } from '@/domain/translator/TaskState';

const themeVars = useThemeVars();

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

  const errorMsgPrefix = seg?.translatorId ? `[${seg?.translatorId}] ` : '';
  const rawError =
    seg && seg.status === 'error'
      ? state?.getSegmentError(selectedSegmentIndex.value)
      : undefined;
  const errorMsg = rawError ? `${errorMsgPrefix}${rawError}`.trim() : undefined;

  return {
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
  <c-modal
    :show="show"
    @update:show="onUpdateShow"
    :title="title"
    style="width: min(900px, 95vw)"
  >
    <template #header-extra>
      <div class="preview-header-extra">
        <div v-if="previewState.previewProgressStatus" class="preview-stats">
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
        <n-divider style="margin: 4px 0 4px" />
      </div>
    </template>

    <div v-if="previewState.ranges.length > 1" class="segment-tabs">
      <n-button
        v-for="(range, i) of previewState.ranges"
        :key="i"
        size="small"
        secondary
        :type="segmentBtnType(previewState.segmentStatuses[i])"
        :title="getSegmentError(i) ?? range.end - range.start + '行'"
        :class="{ active: selectedSegmentIndex === i }"
        :style="
          selectedSegmentIndex === i
            ? {
                outline: `2px solid ${themeVars.primaryColor}`,
                outlineOffset: '1px',
              }
            : undefined
        "
        @click="selectSegment(i)"
      >
        {{ i + 1 }}
      </n-button>
    </div>

    <n-alert
      v-if="previewState.currentSegmentError"
      type="error"
      title="翻译出错"
      :bordered="false"
    >
      <pre class="preview-error-message">{{
        previewState.currentSegmentError
      }}</pre>
    </n-alert>

    <n-table :bordered="false" size="small" class="preview-table">
      <thead>
        <tr>
          <th style="width: 50%">原文</th>
          <th style="width: 50%">译文</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) of previewState.previewParagraphs" :key="i">
          <td class="preview-jp">{{ p.jp }}</td>
          <td class="preview-zh">
            <template v-if="p.zh">{{ p.zh }}</template>
            <span v-else-if="p.jp" class="preview-none">（无译文）</span>
          </td>
        </tr>
      </tbody>
    </n-table>
  </c-modal>
</template>

<style scoped>
.preview-header-extra {
  margin-top: -20px;
}
.preview-stats {
  display: flex;
  gap: 8px;
}
.segment-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 2px;
}
.segment-tabs .n-button {
  min-width: 0;
  padding-inline: 0;
  aspect-ratio: 1;
}
.preview-table {
  margin-top: 8px;
  table-layout: fixed;
}
.preview-table td {
  vertical-align: top;
  line-height: 1.7;
}

@media (min-width: 769px) {
  .preview-jp,
  .preview-zh {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .preview-table thead {
    display: none;
  }
  .preview-table tr {
    display: block;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  }
  .preview-table td {
    display: block;
    width: 100% !important;
    padding: 3px 8px;
    border: none;
  }
  .preview-jp {
    font-weight: 500;
    opacity: 1;
  }
  .preview-zh {
    opacity: 0.6;
  }
}

.preview-none {
  opacity: 0.5;
}
.preview-error-message {
  margin: 0;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
</style>
