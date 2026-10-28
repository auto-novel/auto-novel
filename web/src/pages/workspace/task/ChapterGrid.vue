<script lang="ts" setup>
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import type {
  ChapterSegmentState,
  ChapterStatus,
  TaskState,
} from '@/domain/translator/TaskState';

const props = defineProps<{
  taskState?: TaskState;
}>();

const emit = defineEmits<{
  preview: [chapterId: string];
}>();

const root = ref<HTMLElement>();
const errorsExpanded = ref(false);
const previewLimit = 6;

const statusLabels: Record<ChapterStatus, string> = {
  pending: '等待',
  translating: '处理中',
  done: '成功',
  error: '失败',
};

const phaseLabels = {
  queued: '排队中',
  translating: '翻译中',
  saving: '保存中',
};

const startedChapters = shallowRef(new Set<ChapterSegmentState>());

// 记录本次执行已开始的章节，分段间隙不缩回小号；按状态实例区分重试。
watch(
  () =>
    (props.taskState?.chapters ?? []).flatMap((ch) => {
      if (ch.status !== 'translating') return [];
      const state = props.taskState?.chapterStates.get(ch.chapterId);
      if (!state?.ready) return [];
      return [
        {
          state,
          started:
            state.translatingCount > 0 ||
            state.completedCount > 0 ||
            state.errorCount > 0 ||
            state.segments.length === 0,
        },
      ];
    }),
  (states) => {
    const next = new Set<ChapterSegmentState>();
    for (const { state, started } of states) {
      if (started || startedChapters.value.has(state)) next.add(state);
    }
    if (
      next.size !== startedChapters.value.size ||
      [...next].some((state) => !startedChapters.value.has(state))
    ) {
      startedChapters.value = next;
    }
  },
  { immediate: true },
);

const chapters = computed(() =>
  (props.taskState?.chapters ?? []).map((ch) => {
    const state = props.taskState?.chapterStates.get(ch.chapterId);
    let phase: keyof typeof phaseLabels = 'queued';
    if (ch.status === 'translating') {
      if ((state?.translatingCount ?? 0) > 0) phase = 'translating';
      else if (state?.ready && state.completedCount === state.segments.length)
        phase = 'saving';
    }
    return {
      phase,
      compact:
        phase === 'queued' && (!state || !startedChapters.value.has(state)),
      ...ch,
      // 整章分段准备好后持续显示，包含排队、分段间隙和保存阶段。
      // 完成、失败或中止仍以章节状态为准，不能仅凭 ready 判断。
      status:
        ch.status === 'translating' && !state?.ready
          ? ('pending' as const)
          : ch.status,
      segmentProgress: state?.ready
        ? { completed: state.completedCount, total: state.segments.length }
        : ch.segmentProgress,
    };
  }),
);

type Chapter = (typeof chapters.value)[number];

const groups = computed(() => {
  const byStatus: Record<'translating' | 'error', Chapter[]> = {
    translating: [],
    error: [],
  };
  for (const chapter of chapters.value) {
    if (chapter.status === 'translating' || chapter.status === 'error') {
      byStatus[chapter.status].push(chapter);
    }
  }
  return (['translating', 'error'] as const).flatMap((status) => {
    const items = byStatus[status];
    if (!items.length) return [];
    return {
      status,
      label: statusLabels[status],
      items,
      visible:
        status === 'translating' || errorsExpanded.value
          ? items
          : items.slice(0, previewLimit),
    };
  });
});

function pct(sp: Chapter['segmentProgress']): number {
  if (!sp || sp.total <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((sp.completed / sp.total) * 100)),
  );
}

function description(ch: Chapter): string {
  const progress = ch.segmentProgress;
  const statusLabel =
    ch.status === 'translating'
      ? phaseLabels[ch.phase]
      : statusLabels[ch.status];
  return `任务内编号 #${ch.order} · ${ch.title} · ${statusLabel}${
    progress ? ` · 已完成 ${progress.completed}/${progress.total} 段` : ''
  } · 点击查看预览`;
}

function chapterElement(chapterId: string): HTMLElement | undefined {
  return Array.from(
    root.value?.querySelectorAll<HTMLElement>('[data-chapter-id]') ?? [],
  ).find((element) => element.dataset.chapterId === chapterId);
}

// 章节移出或跨分区时仅恢复键盘焦点，不播放进出动画。
watch(
  () =>
    (props.taskState?.chapters ?? []).map(
      (ch) => [ch.chapterId, ch.status] as const,
    ),
  async (current, previous) => {
    if (!root.value || !previous) return;
    if (
      current.length === previous.length &&
      current.every(
        ([id, status], index) =>
          id === previous[index]?.[0] && status === previous[index]?.[1],
      )
    ) {
      return;
    }
    const focused = document.activeElement;
    const focusedChapterId =
      focused instanceof HTMLElement && root.value.contains(focused)
        ? focused.dataset.chapterId
        : undefined;
    if (!focusedChapterId) return;

    await nextTick();
    if (!root.value) return;
    // 跨分区会重建按钮；仅在焦点确实丢失时恢复，避免抢走预览弹窗的焦点。
    if (
      focusedChapterId &&
      !focused?.isConnected &&
      (!document.activeElement || document.activeElement === document.body)
    ) {
      const status = current.find(([id]) => id === focusedChapterId)?.[1];
      const target =
        chapterElement(focusedChapterId) ??
        (status
          ? root.value.querySelector<HTMLElement>(`[data-region="${status}"]`)
          : undefined) ??
        root.value;
      target?.focus({ preventScroll: true });
    }
  },
  { flush: 'pre' },
);
</script>

<template>
  <div ref="root" class="relative text-ink tabular-nums" tabindex="-1">
    <div
      v-if="groups.length"
      class="grid grid-cols-1 items-stretch gap-2.5 [@media(max-width:480px)]:gap-2"
    >
      <section
        v-for="group of groups"
        :key="group.status"
        :data-region="group.status"
        class="relative min-w-0 border-0 bg-transparent p-0"
        :class="
          group.status === 'translating'
            ? '[--region-color:var(--color-info)]'
            : '[--region-color:var(--color-error)]'
        "
        :aria-label="`${group.label}章节`"
        tabindex="-1"
      >
        <div
          v-if="group.visible.length"
          class="flex flex-wrap content-start gap-1.25 overflow-y-auto p-0.75"
          :class="
            group.status === 'translating' ? 'max-h-75 items-start' : 'max-h-60'
          "
        >
          <button
            v-for="ch of group.visible"
            :key="ch.chapterId"
            type="button"
            :data-chapter-id="ch.chapterId"
            :class="[
              'box-border inline-flex size-10 flex-[0_0_40px] cursor-pointer',
              'flex-col items-center justify-center gap-0.75 overflow-hidden',
              'rounded-[5px] border border-divider bg-transparent p-0.75 text-[11px]',
              'transition-[border-color,background-color] duration-150 ease-[ease]',
              'hover:border-(--region-color) hover:bg-hover',
              'focus-visible:outline-2 focus-visible:outline-offset-1',
              'focus-visible:outline-(--region-color) motion-reduce:transition-none',
              group.status === 'translating' && ch.compact
                ? 'text-muted'
                : 'text-(--region-color)',
              {
                'chapter-progress-fill relative isolate':
                  group.status === 'translating' && !ch.compact,
              },
            ]"
            :style="{ '--chapter-progress': `${pct(ch.segmentProgress)}%` }"
            :title="description(ch)"
            :aria-label="description(ch)"
            @click="emit('preview', ch.chapterId)"
          >
            <template v-if="group.status === 'translating' && !ch.compact">
              <span>#{{ ch.order }}</span>
              <span
                v-if="ch.segmentProgress"
                class="text-[10px]/none whitespace-nowrap"
              >
                {{ ch.segmentProgress.completed }}/{{
                  ch.segmentProgress.total
                }}
              </span>
            </template>
            <template v-else>#{{ ch.order }}</template>
          </button>
        </div>

        <button
          v-if="group.status === 'error' && group.items.length > previewLimit"
          type="button"
          :class="[
            'mt-2 block w-full cursor-pointer border-0 bg-transparent py-1.25',
            'text-[11px] text-(--region-color) hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-1',
            'focus-visible:outline-(--region-color)',
          ]"
          :aria-expanded="errorsExpanded"
          @click="errorsExpanded = !errorsExpanded"
        >
          {{ errorsExpanded ? '收起' : `查看全部 ${group.items.length} 章` }}
        </button>
      </section>
    </div>
    <div
      v-else-if="!chapters.length"
      class="py-3 text-center text-[11px] text-muted"
    >
      暂无章节
    </div>
  </div>
</template>

<style scoped>
/* 动态进度底色集中保留，避免将伪元素定位、层叠和过渡规则堆进模板。 */
.chapter-progress-fill::before {
  position: absolute;
  z-index: -1;
  inset: 0 auto 0 0;
  width: var(--chapter-progress, 0%);
  background: var(--color-info);
  opacity: 0.14;
  content: '';
  pointer-events: none;
  transition: width 250ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .chapter-progress-fill::before {
    transition: none;
  }
}
</style>
