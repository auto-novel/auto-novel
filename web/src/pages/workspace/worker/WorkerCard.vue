<script lang="ts" setup>
import { Toast, getApiErrorMessage } from '@novelia/web-kit';
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  FlashOnOutlined,
  PlayArrowOutlined,
  SettingsOutlined,
  StopOutlined,
  TranslateOutlined,
} from '@vicons/material';
import WorkspaceActionButton from '../WorkspaceActionButton.vue';
import GptWorkerDialog from './GptWorkerDialog.vue';
import TrialTranslationDialog from './TrialTranslationDialog.vue';
import SakuraWorkerDialog from './SakuraWorkerDialog.vue';
import { createTranslator, TranslationPipeline } from '@auto-novel/translator';
import type { TranslationResult } from '@auto-novel/translator';
import {
  findHarnessPresetGroup,
  getHarnessModelPreset,
} from '@auto-novel/translator/harness/presets';
import type {
  GptPipelineWorker,
  SakuraWorker,
  WorkspaceTranslatorId,
} from '@/model/Translator';
import { toTranslatorConfig } from '@/model/Translator';

const props = defineProps<{
  translatorId: WorkspaceTranslatorId;
  worker: GptPipelineWorker | SakuraWorker;
  running: boolean;
  currentConcurrency: number;
  errorCount: number;
}>();

const emit = defineEmits<{
  start: [workerId: string];
  stop: [workerId: string];
  delete: [workerId: string];
}>();

const showEditDialog = ref(false);
const showInteractiveDialog = ref(false);
const editDialogMounted = ref(false);
const interactiveDialogMounted = ref(false);
const statusBadgeClass = [
  'ml-1 inline-flex h-4 cursor-default items-center rounded-xs px-1.75',
  'leading-none whitespace-nowrap tabular-nums',
];

function openEditDialog() {
  editDialogMounted.value = true;
  showEditDialog.value = true;
}

function openInteractiveDialog() {
  interactiveDialogMounted.value = true;
  showInteractiveDialog.value = true;
}

function isWorkerActive(): boolean {
  return props.currentConcurrency > 0;
}

const testWorker = async () => {
  const textJp = [
    '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  ];
  const reasoningLogs: string[] = [];
  const log = (msg: string) => {
    if (msg.startsWith('思考：')) reasoningLogs.push(msg);
  };
  let pipeline: TranslationPipeline | undefined;
  await Toast.promise(
    (async () => {
      const worker = props.worker as GptPipelineWorker;
      const preset =
        props.translatorId === 'gpt'
          ? findHarnessPresetGroup(worker.preset)
          : undefined;
      let result: TranslationResult;
      if (preset) {
        const { createHarnessMode } = await import(
          '@/domain/translator/harness/HarnessMode'
        );
        const translate = createHarnessMode(
          getHarnessModelPreset(preset, worker.model),
          worker.key,
          worker.id,
          log,
        );
        result = await translate(
          { lines: textJp },
          new AbortController().signal,
        );
      } else {
        // 普通模式保留上游的重试、校验与降级路径。
        pipeline = new TranslationPipeline({
          segmentLength: props.translatorId === 'sakura' ? 500 : undefined,
        });
        const translator = await createTranslator({
          ...toTranslatorConfig(props.translatorId, props.worker),
          log,
        });
        pipeline.registerTranslator(translator, { concurrency: 1 });
        result = await pipeline.translate({ lines: textJp });
      }
      const { lines, failed } = result;
      if (failed.length > 0) throw failed[0].error;
      const parts = [`原文：${textJp[0]}`, `译文：${lines.join('')}`];
      if (reasoningLogs.length) parts.push(reasoningLogs.join('\n'));
      return parts.join('\n');
    })(),
    {
      loading: '正在测试翻译器…',
      error: (reason) => getApiErrorMessage(reason, '翻译器错误'),
    },
  )
    .then((result) => {
      Toast.success(result);
    })
    .catch(() => {});
  pipeline?.dispose();
};
</script>

<template>
  <div class="flex text-sm/[1.6]">
    <span class="mt-0.5 mr-3 shrink-0 text-default">
      <DragIndicatorOutlined
        class="drag-trigger inline-block size-4.5 cursor-move align-[-0.125em]"
        aria-hidden="true"
      />
    </span>
    <div class="mb-1 flex grow items-center justify-between">
      <div class="text-base/[1.6] text-default">
        {{ worker.id }}
        <span class="text-xs/[1.6] text-muted">
          <span class="pl-0.5">
            <template v-if="translatorId === 'gpt'">
              {{ (worker as GptPipelineWorker).model }}[{{
                (worker as GptPipelineWorker).key.slice(-4)
              }}]@
            </template>
            {{ worker.endpoint }}
          </span>
          <span class="ml-1.5 inline-flex items-center gap-1.5">
            <span class="font-semibold tabular-nums">
              {{ currentConcurrency }} / {{ worker.concurrency ?? 1 }}
            </span>
            <span
              :class="[
                'size-2 shrink-0 rounded-full',
                'transition-[background,box-shadow] duration-300 ease-in-out',
                isWorkerActive()
                  ? 'bg-success shadow-[0_0_6px_var(--ui-success)]'
                  : 'bg-current',
              ]"
              aria-hidden="true"
            />
            <span
              v-if="running && !isWorkerActive()"
              :class="statusBadgeClass"
              class="bg-muted text-default"
            >
              待机
            </span>
            <span
              v-if="errorCount"
              :class="statusBadgeClass"
              class="bg-error/10 text-error"
            >
              ✕ {{ errorCount }}
            </span>
          </span>
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <WorkspaceActionButton
          :label="running ? '停止' : '启动'"
          :icon="running ? StopOutlined : PlayArrowOutlined"
          @action="running ? emit('stop', worker.id) : emit('start', worker.id)"
        />
        <WorkspaceActionButton
          label="测试"
          tooltip="测试"
          :icon="FlashOnOutlined"
          icon-only
          @action="testWorker"
        />
        <WorkspaceActionButton
          label="试译"
          tooltip="试译"
          :icon="TranslateOutlined"
          icon-only
          @action="openInteractiveDialog"
        />
        <WorkspaceActionButton
          label="设置"
          :tooltip="running ? '请先停止翻译器后再修改' : '设置'"
          :icon="SettingsOutlined"
          :disabled="running"
          icon-only
          @action="openEditDialog"
        />
        <WorkspaceActionButton
          label="删除"
          :tooltip="running ? '请先停止翻译器后再删除' : '删除'"
          :icon="DeleteOutlineOutlined"
          :disabled="running"
          color="error"
          icon-only
          @action="emit('delete', worker.id)"
        />
      </div>
    </div>
  </div>

  <GptWorkerDialog
    v-if="editDialogMounted && translatorId === 'gpt'"
    v-model:show="showEditDialog"
    :worker="worker as GptPipelineWorker"
  />
  <SakuraWorkerDialog
    v-else-if="editDialogMounted"
    v-model:show="showEditDialog"
    :worker="worker"
  />
  <TrialTranslationDialog
    v-if="interactiveDialogMounted"
    v-model:show="showInteractiveDialog"
    :translator-id="translatorId"
    :worker="worker"
    :running="running"
  />
</template>
