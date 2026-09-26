<script lang="ts" setup>
import {
  ChevronRightOutlined,
  KeyboardDoubleArrowUpOutlined,
  KeyboardDoubleArrowDownOutlined,
  RefreshOutlined,
  DeleteOutlineOutlined,
} from '@vicons/material';
import type { ChapterMeta } from '@/domain/translator/TaskState';
import { TaskState, ChapterSegmentState } from '@/domain/translator/TaskState';
import type { TranslateJob, TranslateJobRecord } from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';
import { createTranslationTask } from '@/domain/translator/TranslationTask/createTranslationTask';
import type { TranslationTask } from '@/domain/translator/TranslationTask/types';

const props = defineProps<{
  job: TranslateJob;
  taskState?: TaskState;
  taskCacheEntry?: TranslationTask;
}>();

const emit = defineEmits<{
  delete: [task: string];
  top: [task: string];
  bottom: [task: string];
  retry: [task: string];
}>();

const jobRecord = computed(() => props.job as TranslateJobRecord);
const chapterMetas = computed(() => props.taskState?.chapters ?? []);
async function getChapterMetas(): Promise<ChapterMeta[]> {
  if (props.taskState?.initialized) return chapterMetas.value;

  let task = props.taskCacheEntry;
  if (!task) {
    task = createTask(props.job.task);
  }
  if (!task.initialized) {
    await task.initMeta();
  }
  return task.chapters;
}

function getOrCreateTaskState(): TaskState {
  if (props.taskState) return props.taskState;
  return reactive(new TaskState(props.job.task)) as TaskState;
}

const expanded = ref(false);

const toggleExpand = async () => {
  if (expanded.value) {
    expanded.value = false;
    return;
  }

  const state = getOrCreateTaskState();
  if (!state.initialized) {
    const chapters = await getChapterMetas();
    state.initChapters(chapters);
  }
  expanded.value = true;
};

const themeVars = useThemeVars();

const taskStatus = computed<'done' | 'executing' | 'pending'>(() => {
  if (props.job.finishAt) return 'done';
  if (!chapterMetas.value.length) return 'done';
  if (chapterMetas.value.some((c) => c.status === 'translating'))
    return 'executing';
  return 'pending';
});

function retryAllFailed() {
  for (const ch of chapterMetas.value) {
    if (ch.status === 'error') {
      ch.status = 'pending';
      props.taskState?.chapterStates.delete(ch.chapterId);
    }
  }
  delete props.job.finishAt;
  emit('retry', props.job.task);
}

function hasFailedChapters(): boolean {
  return chapterMetas.value.some((c) => c.status === 'error');
}

defineExpose({ retryAllFailed, hasFailedChapters });

const message = useMessage();

const statusLabel = computed(() => {
  if (taskStatus.value === 'executing') return '翻译中';
  if (taskStatus.value === 'done') return '已完成';
  return '等待中';
});

function createTask(taskDesc: string): TranslationTask {
  const { desc, params } = TranslateTaskDescriptor.parse(taskDesc);
  return createTranslationTask(desc, 'gpt', params);
}

const showPreview = ref(false);
const previewData = ref<{
  title: string;
  chapterState: ChapterSegmentState | null;
} | null>(null);
const openPreview = async (chapterId: string) => {
  try {
    const chapters = await getChapterMetas();
    const meta = chapters.find((c) => c.chapterId === chapterId);
    const title = meta?.title ?? chapterId;

    const chapterState = props.taskState?.chapterStates.get(chapterId);

    let chapterStateForPreview: ChapterSegmentState | null = null;
    if (chapterState?.ready) {
      chapterStateForPreview = chapterState;
    } else {
      let previewTask = props.taskCacheEntry;
      if (!previewTask) {
        previewTask = createTask(props.job.task);
      }
      if (!previewTask.initialized) {
        await previewTask.initMeta();
      }
      const detail = await previewTask.fetchChapter(chapterId);

      if (chapterState?.ready) {
        chapterStateForPreview = chapterState;
      } else if (props.taskState?.getStatus(chapterId) === 'done') {
        const tlParagraphs = detail.oldParagraphZh;
        if (tlParagraphs?.length) {
          const loadedState = new ChapterSegmentState(chapterId);
          loadedState.injectDoneTranslation(detail.paragraphs, tlParagraphs);
          chapterStateForPreview = loadedState;
        }
      } else {
        chapterStateForPreview = chapterState ?? null;
      }
    }

    previewData.value = { title, chapterState: chapterStateForPreview };
    showPreview.value = true;
  } catch (e) {
    console.error('加载预览失败', e);
    message.error('加载预览失败');
  }
};

const closePreview = () => {
  showPreview.value = false;
  // 延迟清除数据，让 modal 关闭动画完成后再释放内容
  setTimeout(() => {
    if (!showPreview.value) {
      previewData.value = null;
    }
  }, 200);
};
</script>

<template>
  <div class="task-card" :class="{ 'task-card--expanded': expanded }">
    <div class="task-card__header" @click="toggleExpand">
      <div class="task-card__title">
        <div class="task-name">{{ job.description }}</div>
        <job-task-link :task="job.task" class="task-link" />
      </div>

      <div class="task-card__status">
        <span class="chip" :class="`chip--${taskStatus}`">
          {{ statusLabel }}
        </span>
        <span class="task-progress">
          {{ jobRecord.progress?.finished ?? 0 }}/{{
            jobRecord.progress?.total ?? chapterMetas.length ?? 0
          }}
        </span>
      </div>

      <div class="task-card__actions">
        <c-icon-button-lite
          tooltip="置顶"
          :icon="KeyboardDoubleArrowUpOutlined"
          @action="emit('top', job.task)"
        />
        <c-icon-button-lite
          tooltip="置底"
          :icon="KeyboardDoubleArrowDownOutlined"
          @action="emit('bottom', job.task)"
        />
        <c-icon-button-lite
          v-if="hasFailedChapters()"
          tooltip="重试失败"
          :icon="RefreshOutlined"
          type="warning"
          @action="retryAllFailed()"
        />
        <c-icon-button-lite
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="emit('delete', job.task)"
        />
      </div>

      <span class="expand-arrow" :class="{ 'expand-arrow--rotated': expanded }">
        <component :is="ChevronRightOutlined" />
      </span>
    </div>

    <div v-if="expanded && chapterMetas.length" class="task-card__body">
      <chapter-grid
        :task-state="taskState"
        @preview="(cid: string) => openPreview(cid)"
      />
    </div>
  </div>

  <chapter-preview-modal
    :show="showPreview"
    :title="previewData?.title ?? ''"
    :chapter-state="previewData?.chapterState ?? null"
    @update:show="
      (v: boolean) => {
        if (!v) closePreview();
      }
    "
  />
</template>

<style scoped>
.task-card {
  --ci-danger: v-bind('themeVars.errorColor');
  --ci-warning: v-bind('themeVars.warningColor');
  --chip-default: v-bind('themeVars.textColor3');
  --chip-info: v-bind('themeVars.infoColor');
  --chip-success: v-bind('themeVars.successColor');
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 3px;
  background: v-bind('themeVars.cardColor');
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}
.task-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
}
.task-card--expanded {
  border-color: v-bind('themeVars.primaryColorHover');
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
}
.task-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}
.task-card__title {
  flex: 1;
  min-width: 0;
}
.task-card__status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.task-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.task-card__body {
  padding: 0 14px 10px 14px;
}
.chip {
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--c) 12%, transparent);
  color: var(--c);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.chip--executing {
  --c: var(--chip-info);
}
.chip--done {
  --c: var(--chip-success);
}
.chip--pending {
  --c: var(--chip-default);
}
.task-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-link {
  font-size: 11px;
  line-height: 1.2;
}
.task-progress {
  font-size: 12px;
  color: v-bind('themeVars.textColor3');
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.expand-arrow {
  display: inline-flex;
  font-size: 14px;
  color: v-bind('themeVars.textColor3');
  margin-left: 2px;
  transition: transform 0.2s ease;
}
.expand-arrow > * {
  width: 1em;
  height: 1em;
}
.expand-arrow--rotated {
  transform: rotate(90deg);
}
</style>
