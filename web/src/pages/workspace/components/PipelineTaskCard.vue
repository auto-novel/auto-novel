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

function updateJobProgress(job: TranslateJobRecord, chapters: ChapterMeta[]) {
  const doneCount = chapters.filter((c) => c.status === 'done').length;
  job.progress = { finished: doneCount, error: 0, total: chapters.length };
  if (doneCount === chapters.length) {
    job.finishAt = Date.now();
  }
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
    if (jobRecord.value.finishAt) {
      state.initChapters(
        chapters.map((c) => ({ ...c, status: 'done' as const })),
      );
    } else {
      updateJobProgress(jobRecord.value, chapters);
    }
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
  <n-card
    size="small"
    :hoverable="true"
    :class="{ 'task-card--expanded': expanded }"
    :header-style="{
      cursor: 'pointer',
      padding: '10px 14px',
      'user-select': 'none',
    }"
    :content-style="
      expanded ? { padding: '0 14px 10px 14px' } : { padding: '0' }
    "
  >
    <template #header>
      <div @click="toggleExpand">
        <n-flex align="center" :wrap="false" style="flex: 1; min-width: 0">
          <div style="flex: 1; min-width: 0">
            <div class="task-name">{{ job.description }}</div>
            <job-task-link :task="job.task" class="task-link" />
          </div>
          <n-flex :size="8" align="center" :wrap="false" style="flex-shrink: 0">
            <n-tag v-if="taskStatus === 'executing'" size="tiny" type="info">
              翻译中
            </n-tag>
            <n-tag v-else-if="taskStatus === 'done'" size="tiny" type="success">
              已完成
            </n-tag>
            <n-tag v-else size="tiny" type="default">等待中</n-tag>
            <span class="task-progress">
              {{ jobRecord.progress?.finished ?? 0 }}/{{
                jobRecord.progress?.total ?? chapterMetas.length ?? 0
              }}
            </span>
          </n-flex>

          <n-flex :size="4" :wrap="false" style="flex-shrink: 0">
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  circle
                  quaternary
                  @click.stop="emit('top', job.task)"
                >
                  <template #icon>
                    <n-icon :component="KeyboardDoubleArrowUpOutlined" />
                  </template>
                </n-button>
              </template>
              置顶
            </n-tooltip>
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  circle
                  quaternary
                  @click.stop="emit('bottom', job.task)"
                >
                  <template #icon>
                    <n-icon :component="KeyboardDoubleArrowDownOutlined" />
                  </template>
                </n-button>
              </template>
              置底
            </n-tooltip>
            <n-tooltip v-if="hasFailedChapters()" trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  circle
                  quaternary
                  type="warning"
                  @click.stop="retryAllFailed()"
                >
                  <template #icon>
                    <n-icon :component="RefreshOutlined" />
                  </template>
                </n-button>
              </template>
              重试失败
            </n-tooltip>
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  circle
                  quaternary
                  type="error"
                  @click.stop="emit('delete', job.task)"
                >
                  <template #icon>
                    <n-icon :component="DeleteOutlineOutlined" />
                  </template>
                </n-button>
              </template>
              删除
            </n-tooltip>
          </n-flex>

          <n-icon
            :component="ChevronRightOutlined"
            :class="['expand-arrow', { 'expand-arrow--rotated': expanded }]"
          />
        </n-flex>
      </div>
    </template>

    <div v-if="expanded && chapterMetas.length">
      <chapter-grid
        :task-state="taskState"
        @preview="(cid: string) => openPreview(cid)"
      />
    </div>
  </n-card>

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
.task-card--expanded {
  --n-border-color: v-bind('themeVars.primaryColorHover');
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
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
  font-size: 14px;
  color: v-bind('themeVars.textColor3');
  margin-left: 2px;
  transition: transform 0.2s ease;
}
.expand-arrow--rotated {
  transform: rotate(90deg);
}
</style>
