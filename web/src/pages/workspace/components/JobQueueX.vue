<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  KeyboardDoubleArrowDownOutlined,
  KeyboardDoubleArrowUpOutlined,
} from '@vicons/material';

import type { WorkspaceJob } from '../WorkspaceStore';

const props = defineProps<{
  job: WorkspaceJob;
  stats: {
    totalTasks: number;
    successTasks: number;
    failedTasks: number;
  };
}>();

const emit = defineEmits<{
  topJob: [];
  bottomJob: [];
  deleteJob: [];
}>();

const percentage = computed(() => {
  const { totalTasks, successTasks, failedTasks } = props.stats;
  if (totalTasks === 0) return 100;
  return Math.round((1000 * (successTasks + failedTasks)) / totalTasks) / 10;
});

const jobStateLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '等待中',
    loading: '加载中',
    processing: '处理中',
    finished: '已完成',
  };
  return map[props.job.state] ?? props.job.state;
});

const hasActiveWork = computed(() =>
  props.job.tasks.some((t) => t.segs.some((s) => s.state === 'processing')),
);
</script>

<template>
  <n-thing>
    <template #avatar>
      <n-flex vertical justify="center" style="height: 100%">
        <n-icon
          class="drag-trigger"
          :size="18"
          :depth="2"
          :component="DragIndicatorOutlined"
          style="cursor: move"
        />
      </n-flex>
    </template>

    <template #header>
      <job-task-link :task="job.descriptor" />
      <n-text
        v-if="job.name"
        depth="3"
        style="font-size: 12px; padding-left: 4px"
      >
        {{ job.name }}
      </n-text>
    </template>

    <template #header-extra>
      <n-flex :size="6" :wrap="false">
        <c-icon-button
          tooltip="置顶"
          :icon="KeyboardDoubleArrowUpOutlined"
          @action="emit('topJob')"
        />
        <c-icon-button
          tooltip="置底"
          :icon="KeyboardDoubleArrowDownOutlined"
          @action="emit('bottomJob')"
        />
        <c-icon-button
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="emit('deleteJob')"
        />
      </n-flex>
    </template>

    <template #description>
      <n-flex vertical :size="8">
        <n-text depth="3">
          <template v-if="hasActiveWork">处理中 -</template>
          总共 {{ stats.totalTasks }} / 成功 {{ stats.successTasks }} / 失败
          {{ stats.failedTasks }}
        </n-text>

        <n-text v-if="job.error" type="error" style="font-size: 12px">
          错误: {{ job.error }}
        </n-text>

        <template v-if="percentage">
          <n-progress :percentage="percentage" style="max-width: 600px" />
        </template>
      </n-flex>
    </template>
  </n-thing>
</template>
