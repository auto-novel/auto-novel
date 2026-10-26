<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  FlashOnOutlined,
  FontDownloadOffOutlined,
  FontDownloadOutlined,
  PlayArrowOutlined,
  SettingsOutlined,
  StopOutlined,
} from '@vicons/material';

import type { TranslatorConfig } from '@/domain/translate';
import { Translator } from '@/domain/translate';
import type { SakuraWorker } from '@/model/Translator';
import { TranslateTaskDescriptor } from '@/model/Translator';
import { useWorkspaceStore } from '@/stores';

const props = defineProps<{
  worker: { translatorId: 'sakura' } & SakuraWorker;
  getNextJob: () =>
    | { task: string; description: string; createAt: number }
    | undefined;
}>();

const emit = defineEmits<{
  'update:progress': [
    string,
    (
      | { state: 'finish'; abort: boolean }
      | { state: 'processed'; finished: number; error: number; total: number }
    ),
  ];
}>();

const translatorConfig = computed<TranslatorConfig & { id: 'sakura' }>(() => ({
  id: 'sakura',
  endpoint: props.worker.endpoint,
  segLength: props.worker.segLength,
  prevSegLength: props.worker.prevSegLength,
}));

const endpointPrefix = computed(() => `${props.worker.segLength ?? 500}@`);

const enableAutoMode = ref(true);

const translateTask = useTemplateRef('translateTask');
const currentJob = ref<{
  task: string;
  description: string;
  createAt: number;
}>();
const running = computed(() => currentJob.value !== undefined);

let abortHandler = () => {};

const processTasks = async () => {
  const controller = new AbortController();
  const { signal } = controller;
  abortHandler = () => controller.abort();

  while (true) {
    const job = props.getNextJob();
    currentJob.value = job;

    if (job === undefined) break;
    const { desc, params } = TranslateTaskDescriptor.parse(job.task);

    const state = await translateTask.value!.startTask(
      desc,
      params,
      translatorConfig.value,
      {
        onProgressUpdated: (progress) => {
          emit('update:progress', job.task, {
            state: 'processed',
            ...progress,
          });
        },
      },
      signal,
    );
    emit('update:progress', job.task, {
      state: 'finish',
      abort: state === 'abort',
    });

    if (state !== 'complete' || !enableAutoMode.value) {
      break;
    }
  }
  currentJob.value = undefined;
};

const startWorker = () => {
  if (running.value) return;
  processTasks();
};
const stopWorker = () => {
  if (!running.value) return;
  abortHandler();
};
const deleteWorker = () => {
  const worker = props.worker;
  abortHandler();
  const workspace = useWorkspaceStore(worker.translatorId);
  workspace.deleteWorker(worker.id);
};

const testWorker = async () => {
  const textJp = [
    '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  ];
  try {
    const translator = await Translator.create(translatorConfig.value);
    const textZh = await translator.translate(textJp);

    const lineJp = textJp[0];
    const lineZh = textZh[0];

    Toast.success(
      [
        `原文：${lineJp}`,
        `译文：${lineZh}`,
        `模型：${translator.sakuraModel()} ${
          translator.allowUpload() ? '允许上传' : '禁止上传'
        }`,
      ].join('\n'),
    );
  } catch (e: unknown) {
    Toast.error(`翻译器错误：${e}`);
  }
};

const showEditWorkerModal = ref(false);
</script>

<template>
  <n-thing content-indented>
    <template #avatar>
      <n-icon
        class="drag-trigger"
        :size="18"
        :depth="2"
        :component="DragIndicatorOutlined"
        style="cursor: move"
      />
    </template>

    <template #header>
      {{ worker.id }}
      <n-text depth="3" style="font-size: 12px; padding-left: 2px">
        {{ endpointPrefix }}{{ translatorConfig.endpoint }}
      </n-text>
    </template>

    <template #description>
      <n-p v-if="currentJob">
        {{ currentJob.description }}
      </n-p>
    </template>

    <template #header-extra>
      <n-flex :size="6" :wrap="false">
        <c-button
          v-if="running"
          label="停止"
          :icon="StopOutlined"
          size="tiny"
          secondary
          @action="stopWorker"
        />
        <c-button
          v-else
          label="启动"
          :icon="PlayArrowOutlined"
          size="tiny"
          secondary
          @action="startWorker"
        />

        <c-icon-button
          tooltip="测试"
          :icon="FlashOnOutlined"
          @action="testWorker"
        />

        <c-icon-button
          tooltip="设置"
          :icon="SettingsOutlined"
          @action="showEditWorkerModal = !showEditWorkerModal"
        />

        <c-icon-button
          v-if="enableAutoMode"
          tooltip="自动翻译下个任务：已启动"
          :icon="FontDownloadOutlined"
          @action="enableAutoMode = false"
        />
        <c-icon-button
          v-else
          tooltip="自动翻译下个任务：已关闭"
          :icon="FontDownloadOffOutlined"
          @action="enableAutoMode = true"
        />

        <c-icon-button
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="deleteWorker"
        />
      </n-flex>
    </template>
  </n-thing>

  <TranslateTask ref="translateTask" style="margin-top: 20px" />

  <sakura-worker-modal v-model:show="showEditWorkerModal" :worker="worker" />
</template>
