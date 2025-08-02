<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  KeyboardDoubleArrowDownOutlined,
  KeyboardDoubleArrowUpOutlined,
  RefreshOutlined,
} from '@vicons/material';

import { WorkspaceJob } from '../WorkspaceStore';

const props = defineProps<{
  job: WorkspaceJob;
}>();

const emit = defineEmits<{
  retry: [];
  moveToTop: [];
  moveToBottom: [];
  delete: [];
}>();

const countTotal = computed(() => {
  return props.job.tasks.length;
});
const countSuccess = computed(() => {
  return props.job.tasks.filter((it) => it.state === 'success').length;
});
const countFailed = computed(() => {
  return props.job.tasks.filter((it) => it.state === 'failed').length;
});
const progressText = computed(() => {
  let text = '';
  if (props.job.state === 'pending') {
    return undefined;
  } else if (props.job.state === 'processing') {
    text = '处理中';
  } else if (props.job.state === 'finished') {
    text = countSuccess < countTotal ? '未完成' : '已完成';
  } else {
    return props.job.state satisfies never;
  }
  return `${text} - 总共 ${countTotal.value} / 成功 ${countSuccess.value} / 失败 ${countFailed.value}`;
});
const progressPercentage = computed(() => {
  if (props.job.state !== 'processing') {
    return undefined;
  } else if (countTotal.value === 0) {
    return 100;
  } else {
    const countFinished = countSuccess.value + countFailed.value;
    return Math.round((1000 * countFinished) / countTotal.value) / 10;
  }
});
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
    </template>

    <template #header-extra>
      <n-flex :size="6" :wrap="false">
        <c-icon-button
          v-if="job.state === 'finished'"
          tooltip="重试"
          :icon="RefreshOutlined"
          @action="emit('retry')"
        />

        <c-icon-button
          tooltip="置顶"
          :icon="KeyboardDoubleArrowUpOutlined"
          @action="emit('moveToTop')"
        />

        <c-icon-button
          tooltip="置底"
          :icon="KeyboardDoubleArrowDownOutlined"
          @action="emit('moveToBottom')"
        />

        <c-icon-button
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="emit('delete')"
        />
      </n-flex>
    </template>

    <template #description>
      <n-flex vertical>
        <n-text>
          {{ job.name }}
        </n-text>
        <n-text v-if="progressText" depth="3">
          {{ progressText }}
        </n-text>
        <n-progress
          v-if="progressPercentage"
          :percentage="progressPercentage"
          style="max-width: 600px"
        />
        <n-flex :size="[4, 4]">
          <template v-for="task in job.tasks" :wrap="false">
            <n-el
              tag="div"
              style="
                width: 28px;
                height: 12px;
                font-size: 8px;
                text-align: center;
              "
            >
              {{ task.descriptor }}
            </n-el>
            <n-el
              v-for="seg in task.segs"
              tag="div"
              class="workspace-seg"
              :data-state="seg.state"
            ></n-el>
          </template>
        </n-flex>
      </n-flex>
    </template>
  </n-thing>
</template>

<style scoped>
.workspace-seg {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
.workspace-seg[data-state='pending'] {
  background-color: var(--text-color-disabled);
}
.workspace-seg[data-state='processing'] {
  background-color: var(--info-color);
}
.workspace-seg[data-state='success'] {
  background-color: var(--primary-color);
}
.workspace-seg[data-state='fallback-success'] {
  background-color: var(--warning-color);
}
.workspace-seg[data-state='failed'] {
  background-color: var(--error-color);
}
</style>
