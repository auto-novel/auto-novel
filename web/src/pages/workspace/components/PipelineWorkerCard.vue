<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  FlashOnOutlined,
  PlayArrowOutlined,
  SettingsOutlined,
  StopOutlined,
} from '@vicons/material';
import { OpenAiTranslator, SakuraTranslator } from '@auto-novel/translator';
import type { GptPipelineWorker, SakuraWorker } from '@/model/Translator';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';

const props = defineProps<{
  translatorId: TranslatorId;
  worker: GptPipelineWorker | SakuraWorker;
  running: boolean;
  concurrency: { current: number; max: number };
  errorCount: number;
}>();

const emit = defineEmits<{
  start: [workerId: string];
  stop: [workerId: string];
  delete: [workerId: string];
}>();

const themeVars = useThemeVars();
const message = useMessage();

const showEditModal = ref(false);

function isWorkerActive(): boolean {
  return props.concurrency.current > 0;
}

const testWorker = async () => {
  const textJp = [
    '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  ];
  const reasoningLogs: string[] = [];
  try {
    const translator =
      props.translatorId === 'sakura'
        ? await SakuraTranslator.create(props.worker)
        : new OpenAiTranslator({
            ...(props.worker as GptPipelineWorker),
            log: (msg) => {
              if (msg.startsWith('思考：')) reasoningLogs.push(msg);
            },
          });

    const textZh = await translator.translate(
      textJp,
      undefined,
      new AbortController().signal,
    );
    const parts = [`原文：${textJp[0]}`, `译文：${textZh.join('')}`];
    if (reasoningLogs.length) parts.push(reasoningLogs.join('\n'));
    message.success(parts.join('\n'));
  } catch (e: unknown) {
    message.error(`翻译器错误：${e}`);
  }
};
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
        <template v-if="translatorId === 'gpt'">
          {{ (worker as GptPipelineWorker).model }}[{{
            (worker as GptPipelineWorker).key.slice(-4)
          }}]@
        </template>
        {{ worker.endpoint }}
      </n-text>
      <span class="viz-translator" style="margin-left: 6px">
        <n-text depth="3" class="viz-concurrency-num">
          {{ concurrency.current }} / {{ concurrency.max }}
        </n-text>
        <span class="viz-status-dot" :class="{ active: isWorkerActive() }" />
        <n-tag
          v-if="errorCount"
          size="tiny"
          type="error"
          :bordered="false"
          class="viz-error-tag"
        >
          ✕ {{ errorCount }}
        </n-tag>
      </span>
    </template>
    <template #header-extra>
      <n-flex :size="6" :wrap="false">
        <c-button
          v-if="running"
          label="停止"
          :icon="StopOutlined"
          size="tiny"
          secondary
          @action="emit('stop', worker.id)"
        />
        <c-button
          v-else
          label="启动"
          :icon="PlayArrowOutlined"
          size="tiny"
          secondary
          @action="emit('start', worker.id)"
        />
        <c-icon-button
          tooltip="测试"
          :icon="FlashOnOutlined"
          @action="testWorker"
        />
        <c-icon-button
          :tooltip="running ? '请先停止翻译器后再修改' : '设置'"
          :icon="SettingsOutlined"
          :disabled="running"
          @action="showEditModal = true"
        />
        <c-icon-button
          :tooltip="running ? '请先停止翻译器后再删除' : '删除'"
          :icon="DeleteOutlineOutlined"
          type="error"
          :disabled="running"
          @action="emit('delete', worker.id)"
        />
      </n-flex>
    </template>
  </n-thing>

  <gpt-pipeline-worker-modal
    v-if="translatorId === 'gpt'"
    v-model:show="showEditModal"
    :worker="showEditModal ? (worker as GptPipelineWorker) : undefined"
  />
  <sakura-worker-modal
    v-else-if="showEditModal"
    v-model:show="showEditModal"
    :worker="worker"
  />
</template>

<style scoped>
.viz-translator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.viz-concurrency-num {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.viz-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: v-bind('themeVars.textColor3');
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease;
}
.viz-status-dot.active {
  background: v-bind('themeVars.successColor');
  box-shadow: 0 0 6px
    color-mix(in srgb, v-bind('themeVars.successColor'), transparent);
}
.viz-error-tag {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}
</style>
