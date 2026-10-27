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
  <div ref="root" class="chapter-pipeline" tabindex="-1">
    <div v-if="groups.length" class="pipeline-layout">
      <section
        v-for="group of groups"
        :key="group.status"
        :data-region="group.status"
        :class="['pipeline-region', `pipeline-region--${group.status}`]"
        :aria-label="`${group.label}章节`"
        tabindex="-1"
      >
        <div
          v-if="group.visible.length"
          :class="[
            'region-chapters',
            { 'region-chapters--active': group.status === 'translating' },
          ]"
        >
          <button
            v-for="ch of group.visible"
            :key="ch.chapterId"
            type="button"
            :data-chapter-id="ch.chapterId"
            :class="[
              'chapter-token',
              {
                'chapter-token--active':
                  group.status === 'translating' && !ch.compact,
                'chapter-token--queued':
                  group.status === 'translating' && ch.compact,
              },
            ]"
            :style="{ '--chapter-progress': `${pct(ch.segmentProgress)}%` }"
            :title="description(ch)"
            :aria-label="description(ch)"
            @click="emit('preview', ch.chapterId)"
          >
            <template v-if="group.status === 'translating' && !ch.compact">
              <span>#{{ ch.order }}</span>
              <span v-if="ch.segmentProgress" class="active-chapter-count">
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
          class="region-expand"
          :aria-expanded="errorsExpanded"
          @click="errorsExpanded = !errorsExpanded"
        >
          {{ errorsExpanded ? '收起' : `查看全部 ${group.items.length} 章` }}
        </button>
      </section>
    </div>
    <div v-else-if="!chapters.length" class="region-empty">暂无章节</div>
  </div>
</template>

<style scoped>
.chapter-pipeline {
  --flow-muted: var(--color-muted);
  --flow-text: var(--color-ink);
  --flow-border: var(--color-divider);
  --flow-info: var(--color-info);
  --flow-error: var(--color-error);
  position: relative;
  color: var(--flow-text);
  font-variant-numeric: tabular-nums;
}
.pipeline-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
}
.pipeline-region {
  --region-color: var(--flow-muted);
  position: relative;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
.pipeline-region--translating {
  --region-color: var(--flow-info);
}
.pipeline-region--error {
  --region-color: var(--flow-error);
}
.region-chapters {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 5px;
  max-height: 240px;
  overflow-y: auto;
  padding: 3px;
}
.region-chapters--active {
  align-items: flex-start;
  max-height: 300px;
}
.chapter-token {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 40px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 40px;
  height: 40px;
  overflow: hidden;
  padding: 3px;
  border: 1px solid var(--flow-border);
  border-radius: 5px;
  background: transparent;
  color: var(--region-color);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 150ms,
    background-color 150ms;
}
.chapter-token:hover {
  border-color: var(--region-color);
  background: var(--color-hover);
}
.chapter-token:focus-visible,
.region-expand:focus-visible {
  outline: 2px solid var(--region-color);
  outline-offset: 1px;
}
.chapter-token--queued {
  color: var(--flow-muted);
}
.chapter-token--active {
  position: relative;
  isolation: isolate;
}
.chapter-token--active::before {
  position: absolute;
  z-index: -1;
  inset: 0 auto 0 0;
  width: var(--chapter-progress, 0%);
  background: var(--flow-info);
  opacity: 0.14;
  content: '';
  pointer-events: none;
  transition: width 250ms ease;
}
.active-chapter-count {
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}
.region-empty {
  padding: 12px 0;
  color: var(--flow-muted);
  font-size: 11px;
  text-align: center;
}
.region-expand {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--region-color);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.region-expand:hover {
  text-decoration: underline;
}
@media (max-width: 480px) {
  .pipeline-layout {
    gap: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chapter-token,
  .chapter-token--active::before {
    transition: none;
  }
}
</style>
