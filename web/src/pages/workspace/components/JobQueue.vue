<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  KeyboardDoubleArrowDownOutlined,
  KeyboardDoubleArrowUpOutlined,
} from '@vicons/material';

import type { TranslateJob } from '@/model/Translator';

const props = defineProps<{
  job: TranslateJob;
  progress?: { finished: number; error: number; total: number };
}>();
const emit = defineEmits<{
  topJob: [];
  bottomJob: [];
  deleteJob: [];
}>();

const percentage = computed(() => {
  if (props.progress === undefined) {
    return 0;
  }
  const { finished, error, total } = props.progress;
  if (total === 0) {
    return 100;
  } else {
    return Math.round((1000 * (finished + error)) / total) / 10;
  }
});

const themeVars = useThemeVars();
</script>

<template>
  <div class="job-row">
    <span class="job-row__handle drag-trigger">
      <component :is="DragIndicatorOutlined" />
    </span>

    <div class="job-row__main">
      <div class="job-row__header">
        <job-task-link :task="job.task" />
        <div class="job-row__actions">
          <c-icon-button-lite
            tooltip="置顶"
            :icon="KeyboardDoubleArrowUpOutlined"
            @action="emit('topJob')"
          />
          <c-icon-button-lite
            tooltip="置底"
            :icon="KeyboardDoubleArrowDownOutlined"
            @action="emit('bottomJob')"
          />
          <c-icon-button-lite
            tooltip="删除"
            :icon="DeleteOutlineOutlined"
            type="error"
            @action="emit('deleteJob')"
          />
        </div>
      </div>

      <div class="job-row__description">
        {{ job.description }}
        <div v-if="percentage" class="job-row__progress">
          <div
            class="job-row__progress-fill"
            :style="{ width: `${percentage}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-row {
  --ci-danger: v-bind('themeVars.errorColor');
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid v-bind('themeVars.dividerColor');
}

.job-row__handle {
  display: inline-flex;
  align-items: center;
  height: 22px;
  color: v-bind('themeVars.textColor3');
  font-size: 18px;
  cursor: move;
}

.job-row__handle > * {
  width: 1em;
  height: 1em;
}

.job-row__main {
  flex: 1;
  min-width: 0;
}

.job-row__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.job-row__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: none;
}

.job-row__description {
  font-size: 14px;
  overflow-wrap: break-word;
  word-break: break-word;
}

.job-row__progress {
  position: relative;
  height: 6px;
  margin-top: 4px;
  max-width: 600px;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  overflow: hidden;
}

.job-row__progress-fill {
  height: 100%;
  background: v-bind('themeVars.primaryColor');
  transition: width 0.2s ease;
}
</style>
