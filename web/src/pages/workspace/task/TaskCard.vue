<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import ChapterGrid from './ChapterGrid.vue';
import ChapterPreviewDialog from './ChapterPreviewDialog.vue';
import TaskLink from './TaskLink.vue';
import TaskProgress from './TaskProgress.vue';
import {
  KeyboardDoubleArrowUpOutlined,
  KeyboardDoubleArrowDownOutlined,
  RefreshOutlined,
  DeleteOutlineOutlined,
} from '@vicons/material';
import type { ChapterMeta, TaskState } from '@/domain/translator/TaskState';
import { ChapterSegmentState } from '@/domain/translator/TaskState';
import type { TranslateJob, TranslateJobRecord } from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';
import { createTranslationTask } from '@/domain/translator/TranslationTask/createTranslationTask';
import type {
  TranslationTask,
  TranslatorId,
} from '@/domain/translator/TranslationTask/types';

const props = defineProps<{
  job: TranslateJob;
  translatorId: TranslatorId;
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
const hasVisibleChapters = computed(() =>
  chapterMetas.value.some(
    (chapter) =>
      chapter.status === 'error' ||
      (chapter.status === 'translating' &&
        props.taskState?.chapterStates.get(chapter.chapterId)?.ready),
  ),
);
const taskProgress = computed(() => {
  const chapters = chapterMetas.value;
  // 历史任务的预览元数据不能用其初始 pending 覆盖已保存的结果。
  if (!chapters.length || (props.job.finishAt && jobRecord.value.progress)) {
    const progress = jobRecord.value.progress;
    const total = Math.max(0, progress?.total ?? 0);
    const done = Math.min(total, Math.max(0, progress?.finished ?? 0));
    const error = Math.min(total - done, Math.max(0, progress?.error ?? 0));
    return {
      total,
      done,
      error,
      translating: 0,
      pending: total - done - error,
    };
  }

  let done = 0;
  let error = 0;
  let translating = 0;
  for (const chapter of chapters) {
    if (chapter.status === 'done') done++;
    else if (chapter.status === 'error') error++;
    else if (chapter.status === 'translating') {
      const state = props.taskState?.chapterStates.get(chapter.chapterId);
      if (state?.ready) translating++;
    }
  }
  return {
    total: chapters.length,
    done,
    error,
    translating,
    pending: chapters.length - done - error - translating,
  };
});
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

const taskStatus = computed<'done' | 'executing' | 'pending'>(() => {
  if (props.job.finishAt) return 'done';
  if (!chapterMetas.value.length)
    return props.taskCacheEntry?.needsPreparation ||
      props.taskCacheEntry?.needsMetadata
      ? 'pending'
      : 'done';
  if (taskProgress.value.translating > 0) return 'executing';
  return 'pending';
});

function retryAllFailed() {
  for (const ch of chapterMetas.value) {
    if (ch.status === 'error') {
      ch.status = 'pending';
      const state = props.taskState?.chapterStates.get(ch.chapterId);
      if (state) state.errorMessage = undefined;
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

function createTask(taskDesc: string): TranslationTask {
  const { desc, params } = TranslateTaskDescriptor.parse(taskDesc);
  return createTranslationTask(desc, props.translatorId, params);
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
    if (chapterState?.ready || chapterState?.errorMessage) {
      // 获取失败时也可直接展示已记录的原因，不再重新请求原文。
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
    Toast.error('加载预览失败');
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
    :bordered="false"
    :class="[
      'task-card @container rounded-none! bg-transparent!',
      '[&+.task-card]:border-t! [&+.task-card]:border-divider!',
    ]"
    :header-style="{ padding: '10px 14px' }"
    :content-style="
      hasVisibleChapters ? { padding: '0 14px 10px 14px' } : { padding: '0' }
    "
  >
    <template #header>
      <div
        :class="[
          'grid grid-cols-1 @min-[640px]:grid-cols-[56px_minmax(0,1fr)]',
          '@min-[640px]:items-center @min-[640px]:gap-x-3.5',
        ]"
      >
        <n-flex
          class="min-w-0 flex-1 @min-[640px]:col-start-2 @min-[640px]:row-start-1"
          align="center"
          :wrap="false"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="truncate text-[14px]">{{ job.description }}</div>
            <task-link :task="job.task" />
          </div>
          <n-flex :size="4" :wrap="false" class="shrink-0">
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
        </n-flex>
        <task-progress :status="taskStatus" :progress="taskProgress" />
      </div>
    </template>

    <div v-if="hasVisibleChapters">
      <chapter-grid
        :task-state="taskState"
        @preview="(cid: string) => openPreview(cid)"
      />
    </div>
  </n-card>

  <ChapterPreviewDialog
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
