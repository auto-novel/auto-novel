<script lang="ts" setup>
import { computed } from 'vue';

import { XProgressCircle } from '@novelia/web-kit';

const props = defineProps<{
  status: 'done' | 'executing' | 'pending' | 'error';
  progress: {
    total: number;
    done: number;
    error: number;
    translating: number;
    pending: number;
  };
}>();

const statusLabel = computed(
  () =>
    ({
      done: '已完成',
      executing: '处理中',
      error: '失败',
      pending: '等待中',
    })[props.status],
);

const segmentClasses = {
  done: 'bg-success',
  translating: 'bg-info',
  error: 'bg-error',
};

const segmentColors = {
  done: 'success',
  translating: 'info',
  error: 'error',
} as const;

const progressDescription = computed(() => {
  const { total, done, error, translating, pending } = props.progress;
  const failure = props.status === 'error' ? '任务失败，' : '';
  return `${failure}共 ${total} 章，成功 ${done} 章，处理中 ${translating} 章，失败 ${error} 章，等待 ${pending} 章`;
});
/** 空任务没有章节可分摊进度，已完成时整圈视为完成。 */
const emptyFinished = computed(
  () => props.progress.total === 0 && props.status === 'done',
);
const progressSegments = computed(() => {
  const { total } = props.progress;
  return (['done', 'translating', 'error'] as const).map((status) => {
    let percentage = total > 0 ? (props.progress[status] / total) * 100 : 0;
    if (emptyFinished.value) percentage = status === 'done' ? 100 : 0;
    return { status, percentage, color: segmentColors[status] };
  });
});
const filledPercentage = computed(() => {
  const { total, done, translating, error } = props.progress;
  return total > 0
    ? Math.min(100, Math.max(0, ((done + translating + error) / total) * 100))
    : 0;
});
const progressPercentage = computed(() => {
  const { done, total } = props.progress;
  if (emptyFinished.value) return 100;
  return total > 0 ? Math.round((done / total) * 100) : 0;
});
</script>

<template>
  <div
    class="mt-1 text-xs/4 font-normal text-muted tabular-nums @min-[640px]:contents"
  >
    <div
      class="mb-1.25 flex flex-wrap items-center gap-1 @min-[640px]:col-start-2 @min-[640px]:row-start-2 @min-[640px]:mt-1 @min-[640px]:mb-0 [&>span]:whitespace-nowrap"
    >
      <span
        :class="{
          'text-info': status === 'executing',
          'text-success': status === 'done',
          'text-error': status === 'error',
        }"
      >
        {{ statusLabel }}
      </span>
      <span aria-hidden="true">·</span>
      <span>等待{{ progress.pending }}</span>
      <span aria-hidden="true">/</span>
      <span>完成{{ progress.done }}</span>
      <span aria-hidden="true">/</span>
      <span>错误{{ progress.error }}</span>
      <span aria-hidden="true">/</span>
      <span>总计{{ progress.total }}</span>
    </div>
    <div
      class="@min-[640px]:col-start-1 @min-[640px]:row-span-2 @min-[640px]:row-start-1 @min-[640px]:self-center"
      role="progressbar"
      aria-label="章节翻译进度"
      :aria-valuenow="emptyFinished ? 1 : progress.done"
      :aria-valuemin="0"
      :aria-valuemax="progress.total || 1"
      :aria-valuetext="progressDescription"
      :title="progressDescription"
    >
      <XProgressCircle
        class="hidden @min-[640px]:block"
        size="sm"
        :percentage="progressPercentage"
        :segments="progressSegments"
        :running="status === 'executing'"
        role="presentation"
        aria-hidden="true"
      />
      <div
        class="relative flex h-1 overflow-hidden rounded-xs bg-accented @min-[640px]:hidden"
        aria-hidden="true"
      >
        <span
          v-for="segment of progressSegments"
          :key="segment.status"
          :class="[
            'h-full flex-none transition-[width] duration-250 ease-[ease]',
            'motion-reduce:transition-none',
            segmentClasses[segment.status],
          ]"
          :style="{ width: `${segment.percentage}%` }"
        />
        <div
          v-if="status === 'executing'"
          class="task-progress-shimmer absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-250 ease-[ease] motion-reduce:transition-none"
          :style="{ width: `${filledPercentage}%` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-progress-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(255 255 255 / 65%),
    transparent
  );
  animation: task-progress-flow 1.6s linear infinite;
}
@keyframes task-progress-flow {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .task-progress-shimmer::after {
    display: none;
    animation: none;
  }
}
</style>
