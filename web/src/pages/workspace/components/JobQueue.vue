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
</script>

<template>
  <n-thing>
    <template #avatar>
      <div
        style="
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 100%;
        "
      >
        <n-icon
          class="drag-trigger"
          :size="18"
          :depth="2"
          :component="DragIndicatorOutlined"
          style="cursor: move"
        />
      </div>
    </template>

    <template #header>
      <job-task-link :task="job.task" />
    </template>
    <template #header-extra>
      <div
        style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap"
      >
        <c-icon-button
          title="置顶"
          :icon="KeyboardDoubleArrowUpOutlined"
          @action="emit('topJob')"
        />

        <c-icon-button
          title="置底"
          :icon="KeyboardDoubleArrowDownOutlined"
          @action="emit('bottomJob')"
        />

        <c-icon-button
          title="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="emit('deleteJob')"
        />
      </div>
    </template>

    <template #description>
      {{ job.description }}
      <template v-if="percentage">
        <n-progress :percentage="percentage" style="max-width: 600px" />
      </template>
    </template>
  </n-thing>
</template>
