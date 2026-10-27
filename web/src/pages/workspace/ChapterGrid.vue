<script lang="ts" setup>
import type { TaskState } from '@/domain/translator/TaskState';

const props = defineProps<{
  taskState?: TaskState;
}>();

const emit = defineEmits<{
  preview: [chapterId: string];
}>();

const statusClasses = {
  pending: 'bg-muted/10 text-muted before:bg-primary/20',
  translating: 'bg-info/10 text-info before:bg-info/20',
  done: 'bg-success/10 text-success',
  error: 'bg-error/10 text-error before:bg-error/20',
};

const chapters = computed(() => {
  const metas = props.taskState?.chapters ?? [];
  return metas.map((ch) => {
    const chState = props.taskState?.chapterStates.get(ch.chapterId);
    const liveProgress = chState?.ready
      ? { completed: chState.completedCount, total: chState.segments.length }
      : ch.segmentProgress;
    let displayStatus = ch.status;
    if (
      displayStatus === 'translating' &&
      (!chState?.ready || chState.translatingCount === 0)
    ) {
      displayStatus = 'pending';
    }
    return {
      ...ch,
      status: displayStatus,
      segmentProgress: liveProgress,
    };
  });
});

function pct(sp: { completed: number; total: number } | undefined): number {
  if (!sp || sp.total <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((sp.completed / sp.total) * 100)),
  );
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-0.5">
    <button
      v-for="ch of chapters"
      :key="ch.chapterId"
      type="button"
      class="relative flex aspect-square w-full min-w-0 cursor-pointer appearance-none flex-col items-center justify-center gap-px overflow-hidden rounded-sm p-[2px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      :class="[
        statusClasses[ch.status],
        {
          'before:absolute before:inset-x-0 before:bottom-0 before:h-(--progress)':
            ch.segmentProgress && ch.status !== 'done',
        },
      ]"
      :style="{ '--progress': `${pct(ch.segmentProgress)}%` }"
      @click="emit('preview', ch.chapterId)"
    >
      <span class="relative text-[11px] leading-none font-semibold">
        {{ ch.order }}
      </span>
      <span
        v-if="ch.segmentProgress"
        class="relative text-[8px] leading-none opacity-75"
      >
        {{ ch.segmentProgress.completed }}/{{ ch.segmentProgress.total }}
      </span>
    </button>
  </div>
</template>
