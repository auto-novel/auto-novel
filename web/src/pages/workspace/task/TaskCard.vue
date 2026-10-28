<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import ChapterGrid from './ChapterGrid.vue';
import ChapterPreviewDialog from './ChapterPreviewDialog.vue';
import TaskLink from './TaskLink.vue';
import TaskProgress from './TaskProgress.vue';
import WorkspaceActionButton from '../WorkspaceActionButton.vue';
import {
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
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
  canMoveTop: boolean;
  canMoveBottom: boolean;
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
  if (props.taskState?.resetFailedChapters()) {
    delete props.job.finishAt;
    emit('retry', props.job.task);
  }
}

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
    class="task-card @container rounded-none! bg-transparent!"
    :header-style="{ padding: '10px 0' }"
    :content-style="
      hasVisibleChapters ? { padding: '0 0 10px' } : { padding: '0' }
    "
  >
    <template #header>
      <div
        :class="[
          'grid grid-cols-1 @min-[640px]:grid-cols-[56px_minmax(0,1fr)]',
          '@min-[640px]:items-center @min-[640px]:gap-x-3.5',
        ]"
      >
        <div
          class="flex min-w-0 flex-1 flex-col gap-1 @min-[640px]:col-start-2 @min-[640px]:row-start-1"
        >
          <n-flex align="center" :wrap="false">
            <div class="min-w-0 flex-1 truncate text-[14px]">
              {{ job.description }}
            </div>
            <div class="flex shrink-0 items-center gap-1.5" @click.stop>
              <WorkspaceActionButton
                v-if="canMoveTop || canMoveBottom"
                label="移至队首"
                tooltip="移至队首"
                :icon="VerticalAlignTopOutlined"
                icon-only
                :disabled="!canMoveTop"
                @action="canMoveTop && emit('top', job.task)"
              />
              <WorkspaceActionButton
                v-if="canMoveTop || canMoveBottom"
                label="移至队尾"
                tooltip="移至队尾"
                :icon="VerticalAlignBottomOutlined"
                icon-only
                :disabled="!canMoveBottom"
                @action="canMoveBottom && emit('bottom', job.task)"
              />
              <WorkspaceActionButton
                v-if="taskState?.hasFailedChapters()"
                label="重试失败"
                tooltip="重试失败"
                :icon="RefreshOutlined"
                icon-only
                color="warning"
                @action="retryAllFailed"
              />
              <WorkspaceActionButton
                label="删除任务"
                tooltip="删除"
                :icon="DeleteOutlineOutlined"
                icon-only
                color="danger"
                @action="emit('delete', job.task)"
              />
            </div>
          </n-flex>
          <task-link :task="job.task" />
        </div>
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
