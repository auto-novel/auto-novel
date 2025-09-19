<script lang="ts" setup>
import {
  DeleteOutlineOutlined,
  DragIndicatorOutlined,
  FlashOnOutlined,
  PlayArrowOutlined,
  SettingsOutlined,
  StopOutlined,
} from '@vicons/material';

import { Locator } from '@/data';
import {
  SegmentTranslator,
  Translator,
  TranslatorConfig,
} from '@/domain/translate';
import { GptWorker, SakuraWorker } from '@/model/Translator';
import { WorkspaceSegment } from '../WorkspaceStore';
import { Glossary } from '@/model/Glossary';
import { parallelExecInfinite } from '@/util';

const props = defineProps<{
  worker:
    | ({ translatorId: 'sakura' } & SakuraWorker)
    | ({ translatorId: 'gpt' } & GptWorker);
  requestSeg: () =>
    | {
        segId: [string, string];
        seg: WorkspaceSegment;
        glossary: Glossary;
      }
    | undefined;
  postSeg: (id: [string, string]) => void;
}>();

const message = useMessage();

const translatorConfig = computed(() => {
  const worker = props.worker;
  if (worker.translatorId === 'gpt') {
    return <TranslatorConfig & { id: 'gpt' }>{
      id: 'gpt',
      type: worker.type,
      model: worker.model,
      endpoint: worker.endpoint,
      key: worker.key,
    };
  } else {
    return <TranslatorConfig & { id: 'sakura' }>{
      id: 'sakura',
      endpoint: worker.endpoint,
      segLength: worker.segLength,
      prevSegLength: worker.prevSegLength,
    };
  }
});

const endpoint = computed(() => {
  const worker = props.worker;
  if (worker.translatorId === 'gpt') {
    if (worker.type === 'web') {
      return `web[${worker.key.slice(-4)}]@`;
    } else {
      return `${worker.model}[${worker.key.slice(-4)}]@${worker.endpoint}`;
    }
  } else {
    return `${worker.segLength ?? 500}@${worker.endpoint}`;
  }
});

const running = ref(false);
let abortTranslate = () => {};

const startTranslate = async () => {
  const controller = new AbortController();
  const { signal } = controller;
  abortTranslate = () => controller.abort();

  let translator: SegmentTranslator;
  try {
    translator = await Translator.createSegmentTranslator(
      (message, detail) => {},
      translatorConfig.value,
    );
  } catch (e: any) {
    message.error(`创建翻译器失败：${e}`);
    return;
  }

  const concurrent = 1;
  await parallelExecInfinite(
    () => {
      const segResult = props.requestSeg();
      if (segResult === undefined) return undefined;
      const { segId, seg, glossary } = segResult;
      const fn = () =>
        translator
          .translate(seg.src, { glossary, prevSegs: [], signal })
          .then((dst: string[]) => {
            seg.state = 'success';
            seg.dst = dst;
            props.postSeg(segId);
          })
          .catch(() => {
            if (signal.aborted) {
              seg.state = 'pending';
            } else {
              seg.state = 'failed';
            }
          });
      return fn();
    },
    concurrent,
    signal,
  );
};

const startWorker = () => {
  if (running.value) return;
  running.value = true;
  startTranslate();
};
const stopWorker = () => {
  if (!running.value) return;
  running.value = false;
  abortTranslate();
};
const deleteWorker = () => {
  const worker = props.worker;
  abortTranslate();
  const workspace =
    worker.translatorId === 'gpt'
      ? Locator.gptWorkspaceRepository()
      : Locator.sakuraWorkspaceRepository();
  workspace.deleteWorker(worker.id);
};

const testWorker = async () => {
  const worker = props.worker;
  const textJp = [
    '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  ];
  try {
    const translator = await Translator.create(translatorConfig.value);
    const textZh = await translator.translate(textJp);

    const lineJp = textJp[0];
    const lineZh = textZh[0];

    if (worker.translatorId === 'gpt') {
      message.success(`原文：${lineJp}\n译文：${lineZh}`);
    } else {
      message.success(
        [
          `原文：${lineJp}`,
          `译文：${lineZh}`,
          `模型：${translator.sakuraModel()} ${
            translator.allowUpload() ? '允许上传' : '禁止上传'
          }`,
        ].join('\n'),
      );
    }
  } catch (e: any) {
    message.error(`翻译器错误：${e}`);
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
        {{ endpoint }}
      </n-text>
    </template>

    <template #header-extra>
      <n-flex :size="6" :wrap="false">
        <c-button
          v-if="!running"
          label="启动"
          :icon="PlayArrowOutlined"
          size="tiny"
          secondary
          @action="startWorker"
        />
        <c-button
          v-else
          label="停止"
          :icon="StopOutlined"
          size="tiny"
          secondary
          @action="stopWorker"
        />

        <c-icon-button
          :disabled="running"
          tooltip="测试"
          :icon="FlashOnOutlined"
          @action="testWorker"
        />

        <c-icon-button
          :disabled="running"
          tooltip="设置"
          :icon="SettingsOutlined"
          @action="showEditWorkerModal = !showEditWorkerModal"
        />

        <c-icon-button
          :disabled="running"
          tooltip="删除"
          :icon="DeleteOutlineOutlined"
          type="error"
          @action="deleteWorker"
        />
      </n-flex>
    </template>
  </n-thing>

  <sakura-worker-modal
    v-if="worker.translatorId === 'sakura'"
    v-model:show="showEditWorkerModal"
    :worker="worker"
  />
  <gpt-worker-modal
    v-else-if="worker.translatorId === 'gpt'"
    v-model:show="showEditWorkerModal"
    :worker="worker"
  />
</template>
