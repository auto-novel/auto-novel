<script lang="ts" setup>
import { computed, useId } from 'vue';

const shimmerId = useId();

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

const segmentClasses = {
  done: { fill: 'bg-success', ring: 'stroke-success' },
  translating: { fill: 'bg-info', ring: 'stroke-info' },
  error: { fill: 'bg-error', ring: 'stroke-error' },
};

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
const filledPercentage = computed(() => {
  const { total, done, translating, error } = props.progress;
  return total > 0
    ? Math.min(100, Math.max(0, ((done + translating + error) / total) * 100))
    : 0;
});
const progressPercentage = computed(() => {
  const { done, total } = props.progress;
  return total > 0 ? Math.round((done / total) * 100) : 0;
});
</script>

<template>
  <div
    class="mt-1 text-xs/4 font-normal text-muted tabular-nums @min-[640px]:contents"
  >
    <div
      class="mb-1.25 flex flex-wrap items-center justify-start gap-1 @min-[640px]:col-start-2 @min-[640px]:row-start-2 @min-[640px]:mt-1 @min-[640px]:mb-0 [&>span]:whitespace-nowrap"
    >
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
      class="@min-[640px]:col-start-1 @min-[640px]:row-span-2 @min-[640px]:row-start-1 @min-[640px]:self-center"
      role="progressbar"
      aria-label="章节翻译进度"
      :aria-valuenow="progress.done"
      :aria-valuemin="0"
      :aria-valuemax="progress.total || 1"
      :aria-valuetext="progressDescription"
      :title="progressDescription"
    >
      <div class="hidden size-14 @min-[640px]:block">
        <svg
          class="block size-full"
          viewBox="0 0 56 56"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            class="fill-none stroke-divider stroke-4"
            cx="28"
            cy="28"
            r="23"
          />
          <circle
            v-for="segment of progressSegments"
            :key="segment.status"
            :class="[
              'origin-center -rotate-90 fill-none stroke-4',
              'transition-[stroke-dasharray,stroke-dashoffset] duration-250 ease-[ease]',
              'motion-reduce:transition-none',
              segmentClasses[segment.status].ring,
            ]"
            cx="28"
            cy="28"
            r="23"
            pathLength="100"
            :stroke-dasharray="`${segment.percentage} ${100 - segment.percentage}`"
            :stroke-dashoffset="-segment.offset"
          />
          <g v-if="status === 'executing'">
            <defs>
              <mask
                :id="`${shimmerId}-mask`"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="56"
                height="56"
              >
                <circle
                  class="origin-center -rotate-90 fill-none stroke-4 transition-[stroke-dasharray] duration-250 ease-[ease] motion-reduce:transition-none"
                  stroke="white"
                  cx="28"
                  cy="28"
                  r="23"
                  pathLength="100"
                  :stroke-dasharray="`${filledPercentage} ${100 - filledPercentage}`"
                />
              </mask>
            </defs>
            <foreignObject
              :mask="`url(#${shimmerId}-mask)`"
              x="0"
              y="0"
              width="56"
              height="56"
            >
              <div class="task-ring-shimmer size-full" />
            </foreignObject>
          </g>
          <text
            x="28"
            y="28"
            dy=".35em"
            class="fill-ink text-[11px] font-semibold [text-anchor:middle]"
          >
            {{ progressPercentage }}%
          </text>
        </svg>
      </div>
      <div
        class="relative flex h-1 overflow-hidden rounded-xs bg-divider @min-[640px]:hidden"
        aria-hidden="true"
      >
        <span
          v-for="segment of progressSegments"
          :key="segment.status"
          :class="[
            'h-full flex-none transition-[width] duration-250 ease-[ease]',
            'motion-reduce:transition-none',
            segmentClasses[segment.status].fill,
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
.task-ring-shimmer {
  background: conic-gradient(
    transparent 0deg 240deg,
    rgb(255 255 255 / 65%) 300deg,
    transparent 360deg
  );
  animation: task-ring-flow 1.6s linear infinite;
}
@keyframes task-ring-flow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
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
  .task-ring-shimmer,
  .task-progress-shimmer::after {
    display: none;
    animation: none;
  }
}
</style>
