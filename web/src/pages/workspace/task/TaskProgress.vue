<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  status: 'done' | 'executing' | 'pending';
  progress: {
    total: number;
    done: number;
    error: number;
    translating: number;
    pending: number;
  };
}>();

const progressDescription = computed(() => {
  const { total, done, error, translating, pending } = props.progress;
  return `共 ${total} 章，成功 ${done} 章，处理中 ${translating} 章，失败 ${error} 章，等待 ${pending} 章`;
});
const progressSegments = computed(() => {
  const { total } = props.progress;
  let offset = 0;
  return (['done', 'translating', 'error'] as const).map((status) => {
    const percentage = total > 0 ? (props.progress[status] / total) * 100 : 0;
    const segment = { status, percentage, offset };
    offset += percentage;
    return segment;
  });
});
const progressPercentage = computed(() => {
  const { done, total } = props.progress;
  return total > 0 ? Math.round((done / total) * 100) : 0;
});
</script>

<template>
  <div class="task-progress">
    <div class="task-progress-labels">
      <span
        :class="{
          'text-info': status === 'executing',
          'text-success': status === 'done',
        }"
      >
        {{
          status === 'executing'
            ? '处理中'
            : status === 'done'
              ? '已完成'
              : '等待中'
        }}
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
      class="task-progress-visual"
      role="progressbar"
      aria-label="章节翻译进度"
      :aria-valuenow="progress.done"
      :aria-valuemin="0"
      :aria-valuemax="progress.total || 1"
      :aria-valuetext="progressDescription"
      :title="progressDescription"
    >
      <div class="task-progress-ring">
        <svg viewBox="0 0 56 56" aria-hidden="true" focusable="false">
          <circle class="task-ring-track" cx="28" cy="28" r="23" />
          <circle
            v-for="segment of progressSegments"
            :key="segment.status"
            :class="[
              'task-ring-segment',
              `task-ring-segment--${segment.status}`,
            ]"
            cx="28"
            cy="28"
            r="23"
            pathLength="100"
            :stroke-dasharray="`${segment.percentage} ${100 - segment.percentage}`"
            :stroke-dashoffset="-segment.offset"
          />
          <text x="28" y="28" dy=".35em" class="task-ring-percentage">
            {{ progressPercentage }}%
          </text>
        </svg>
      </div>
      <div class="task-progress-track" aria-hidden="true">
        <span
          v-for="segment of progressSegments"
          :key="segment.status"
          :class="[
            'task-progress-fill',
            `task-progress-fill--${segment.status}`,
          ]"
          :style="{ width: `${segment.percentage}%` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference '../../../style.css';

.task-progress {
  margin-top: 4px;
  @apply text-xs/4 font-normal text-muted;
  font-variant-numeric: tabular-nums;
}
.task-progress-labels {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  margin-bottom: 5px;
  flex-wrap: wrap;
}
.task-progress-labels > span {
  white-space: nowrap;
}
.task-progress-track {
  display: flex;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  @apply bg-divider;
}
.task-progress-fill {
  flex: 0 0 auto;
  height: 100%;
  transition: width 250ms ease;
}
.task-progress-fill--done {
  @apply bg-success;
}
.task-progress-fill--translating {
  @apply bg-info;
}
.task-progress-fill--error {
  @apply bg-error;
}
.task-progress-ring {
  display: none;
  width: 56px;
  height: 56px;
}
.task-progress-ring svg {
  display: block;
  width: 100%;
  height: 100%;
}
.task-ring-track,
.task-ring-segment {
  fill: none;
  stroke-width: 4;
}
.task-ring-track {
  @apply stroke-divider;
}
.task-ring-segment {
  transform: rotate(-90deg);
  transform-origin: center;
  transition:
    stroke-dasharray 250ms ease,
    stroke-dashoffset 250ms ease;
}
.task-ring-segment--done {
  @apply stroke-success;
}
.task-ring-segment--translating {
  @apply stroke-info;
}
.task-ring-segment--error {
  @apply stroke-error;
}
.task-ring-percentage {
  @apply fill-ink;
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
}
@container (min-width: 640px) {
  /* 展开根容器，让计数和进度环参与任务标题的 Grid 布局。 */
  .task-progress {
    display: contents;
  }
  .task-progress-labels {
    grid-column: 2;
    grid-row: 2;
    margin: 4px 0 0;
  }
  .task-progress-visual {
    grid-column: 1;
    grid-row: 1 / span 2;
    align-self: center;
  }
  .task-progress-ring {
    display: block;
  }
  .task-progress-track {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .task-progress-fill,
  .task-ring-segment {
    transition: none;
  }
}
</style>
