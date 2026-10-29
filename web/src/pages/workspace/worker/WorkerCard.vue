<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
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
import { OpenAiTranslator, SakuraTranslator } from '@auto-novel/translator';
import {
  findHarnessPresetGroup,
  getHarnessModelPreset,
} from '@auto-novel/translator/harness/presets';
import type { GptPipelineWorker, SakuraWorker } from '@/model/Translator';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';

const props = defineProps<{
  translatorId: TranslatorId;
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
  try {
    const worker = props.worker as GptPipelineWorker;
    const harnessPreset =
      props.translatorId === 'gpt'
        ? findHarnessPresetGroup(worker.preset)
        : undefined;
    const signal = new AbortController().signal;
    let textZh: string[];
    if (harnessPreset) {
      const { translateChapter } = await import(
        '@auto-novel/translator/harness'
      );
      textZh = await translateChapter({
        source: textJp,
        glossary: {},
        preset: getHarnessModelPreset(harnessPreset, worker.model),
        key: worker.key,
        signal,
      });
    } else {
      const translator =
        props.translatorId === 'sakura'
          ? await SakuraTranslator.create(props.worker)
          : new OpenAiTranslator({
              ...worker,
              log: (msg) => {
                if (msg.startsWith('思考：')) reasoningLogs.push(msg);
              },
            });
      textZh = await translator.translate(textJp, undefined, signal);
    }
    const parts = [`原文：${textJp[0]}`, `译文：${textZh.join('')}`];
    if (reasoningLogs.length) parts.push(reasoningLogs.join('\n'));
    Toast.success(parts.join('\n'));
  } catch (e: unknown) {
    Toast.error(`翻译器错误：${e}`);
  }
};
</script>

<template>
  <div class="flex text-sm/[1.6]">
    <span class="mt-0.5 mr-3 shrink-0 text-ink">
      <DragIndicatorOutlined
        class="drag-trigger inline-block size-4.5 cursor-move align-[-0.125em]"
        aria-hidden="true"
      />
    </span>
    <div class="mb-1 flex grow items-center justify-between">
      <div class="text-base/[1.6] text-ink">
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
                  ? 'bg-success shadow-[0_0_6px_var(--color-success)]'
                  : 'bg-current',
              ]"
              aria-hidden="true"
            />
            <span
              v-if="running && !isWorkerActive()"
              :class="statusBadgeClass"
              class="bg-neutral-soft text-neutral-text"
            >
              待机
            </span>
            <span
              v-if="errorCount"
              :class="statusBadgeClass"
              class="bg-error-soft text-error-text"
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
          color="danger"
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
