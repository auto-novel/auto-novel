<script lang="ts" setup>
import { DeleteOutlineOutlined, RefreshOutlined } from '@vicons/material';

import type { TranslateJobRecord } from '@/model/Translator';
import { TranslateJob } from '@/model/Translator';
import { Humanize } from '@/util';

const props = defineProps<{
  job: TranslateJobRecord;
}>();
const emit = defineEmits<{
  retryJob: [];
  deleteJob: [];
}>();
const isFinished = computed(() => TranslateJob.isFinished(props.job));

const themeVars = useThemeVars();
</script>

<template>
  <div class="job-record">
    <div class="job-record__header">
      <job-task-link :task="job.task" />
      <div class="job-record__actions">
        <c-icon-button-lite
          v-if="!isFinished"
          tooltip="重试"
          :icon="RefreshOutlined"
          @action="emit('retryJob')"
        />
        <c-icon-button-lite
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="emit('deleteJob')"
        />
      </div>
    </div>

    <div class="job-record__description">
      {{ job.description }}
      <br />
      <span class="job-record__meta">
        <template v-if="!isFinished">
          未完成
          <template v-if="job.progress !== undefined">
            总共 {{ job.progress?.total }} / 成功 {{ job.progress?.finished }} /
            失败 {{ job.progress?.error }}
          </template>
        </template>
        <template v-else>
          已完成
          <template v-if="job.finishAt">
            {{ Humanize.relativeTime(job.finishAt) }}
          </template>
        </template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.job-record {
  --ci-danger: v-bind('themeVars.errorColor');
  padding: 10px 0;
  border-top: 1px solid v-bind('themeVars.dividerColor');
}

.job-record__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.job-record__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: none;
}

.job-record__description {
  font-size: 14px;
  overflow-wrap: break-word;
  word-break: break-word;
}

.job-record__meta {
  font-size: 12px;
  color: v-bind('themeVars.textColor3');
}
</style>
