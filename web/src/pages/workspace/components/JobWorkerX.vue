<script lang="ts" setup>
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

import type {
  SegmentCache,
  SegmentTranslator,
  TranslatorConfig,
} from '@/domain/translate';
import { createSegIndexedDbCache, Translator } from '@/domain/translate';
import { SakuraTranslator } from '@/domain/translate';
import type { GptWorker, SakuraWorker } from '@/model/Translator';
import { useWorkspaceStore } from '@/stores';
import { delay, RegexUtil } from '@/util';

import type {
  SegRequestResult,
  WorkspaceJob,
  WorkspaceSegment,
} from '../WorkspaceStore';

const props = defineProps<{
  worker:
    | ({ translatorId: 'sakura' } & SakuraWorker)
    | ({ translatorId: 'gpt' } & GptWorker);
  jobs: WorkspaceJob[];
  requestSeg: (workerId: string) => Promise<SegRequestResult | undefined>;
  releaseWorkerClaims: (workerId: string) => void;
  postSeg: (
    jobDescriptor: string,
    taskIndex: number,
    segIndex: number,
    result: {
      state: 'success' | 'failed';
      dst: string[];
      log: string[];
    },
  ) => Promise<void>;
}>();

const message = useMessage();

const concurrency = computed(() => props.worker.concurrency ?? 1);
const maxRetry = computed(() => props.worker.retryCount ?? 3);

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
  }

  return <TranslatorConfig & { id: 'sakura' }>{
    id: 'sakura',
    endpoint: worker.endpoint,
    segLength: worker.segLength,
    prevSegLength: worker.prevSegLength,
  };
});

const endpointPrefix = computed(() => {
  const worker = props.worker;
  if (worker.translatorId === 'gpt') {
    if (worker.type === 'web') {
      return `web[${worker.key.slice(-4)}]@`;
    }
    return `${worker.model}[${worker.key.slice(-4)}]@`;
  }
  return `${worker.segLength ?? 500}@`;
});

const enableAutoMode = ref(true);
const running = ref(false);
const hasStarted = ref(false);
const statusText = ref('待启动');
const activeCount = ref(0);
const activeJobDescriptors = ref(new Set<string>());

const myJobs = computed(() =>
  props.jobs.filter((j) => activeJobDescriptors.value.has(j.descriptor)),
);

const visibleTasks = computed(() => {
  const result: { job: WorkspaceJob; taskIndex: number; chapterNum: number }[] =
    [];
  let num = 0;
  for (const job of myJobs.value) {
    for (let ti = 0; ti < job.tasks.length; ti++) {
      num++;
      result.push({ job, taskIndex: ti, chapterNum: num });
    }
  }
  return result;
});

// Task-level (chapter) progress
const taskStats = computed(() => {
  let total = 0;
  let success = 0;
  let failed = 0;
  for (const job of myJobs.value) {
    for (const task of job.tasks) {
      total++;
      if (task.state === 'success') success++;
      else if (task.state === 'failed') failed++;
    }
  }
  return { total, success, failed };
});

// Circle percentage based on chapter progress
const progressPercentage = computed(() => {
  const { total, success, failed } = taskStats.value;
  if (total === 0) return 0;
  return Math.round((1000 * (success + failed)) / total) / 10;
});

let controller: AbortController | null = null;

const startWorker = async () => {
  if (running.value) return;
  running.value = true;
  hasStarted.value = true;
  statusText.value = '启动中...';
  controller = new AbortController();
  const { signal } = controller;

  try {
    const segTranslators: SegmentTranslator[] = [];
    const caches: (SegmentCache | undefined)[] = [];

    for (let i = 0; i < concurrency.value; i++) {
      const segTranslator = await Translator.createSegmentTranslator(
        () => {},
        translatorConfig.value,
      );
      segTranslators.push(segTranslator);

      let cache: SegmentCache | undefined;
      if (translatorConfig.value.id === 'gpt') {
        cache = await createSegIndexedDbCache('gpt-seg-cache');
      } else if (translatorConfig.value.id === 'sakura') {
        cache = await createSegIndexedDbCache('sakura-seg-cache');
      }
      caches.push(cache);
    }

    const lanes = Array.from({ length: concurrency.value }, (_, i) =>
      runLane(i, segTranslators[i], caches[i], signal),
    );

    await Promise.all(lanes);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.error('Worker error:', e);
      message.error(`翻译失败: ${e}`);
    }
  } finally {
    running.value = false;
    statusText.value = '已停止';
    activeCount.value = 0;
    activeJobDescriptors.value = new Set();
    controller = null;
    props.releaseWorkerClaims(props.worker.id);
  }
};

const runLane = async (
  laneId: number,
  segTranslator: SegmentTranslator,
  segCache: SegmentCache | undefined,
  signal: AbortSignal,
) => {
  while (!signal.aborted) {
    const req = await props.requestSeg(props.worker.id);

    if (!req) {
      if (props.jobs.length === 0) break;
      statusText.value = '等待任务...';
      if (!enableAutoMode.value) break;
      await delay(500, signal);
      continue;
    }

    activeCount.value++;
    statusText.value = `翻译中(${activeCount.value}/${concurrency.value})`;

    const { jobDescriptor, taskIndex, segIndex, seg, glossary, prevSegs } = req;
    activeJobDescriptors.value.add(jobDescriptor);
    const log: string[] = [];

    try {
      const dst = await translateSegment(
        segTranslator,
        segCache,
        seg.src,
        glossary,
        prevSegs,
        log,
        signal,
      );

      await props.postSeg(jobDescriptor, taskIndex, segIndex, {
        state: 'success',
        dst,
        log,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        seg.state = 'pending';
        throw e;
      }

      log.push(`失败: ${e}`);

      if (seg.retryCount < maxRetry.value) {
        seg.retryCount++;
        log.push(`重试 ${seg.retryCount}/${maxRetry.value}`);
        seg.state = 'pending';
        seg.log.push(...log);
      } else {
        await props.postSeg(jobDescriptor, taskIndex, segIndex, {
          state: 'failed',
          dst: [],
          log,
        });
      }
    } finally {
      activeCount.value--;
      if (activeCount.value > 0) {
        statusText.value = `翻译中(${activeCount.value}/${concurrency.value})`;
      } else {
        statusText.value = '等待任务...';
      }
    }
  }
};

const translateSegment = async (
  segTranslator: SegmentTranslator,
  segCache: SegmentCache | undefined,
  seg: string[],
  glossary: Record<string, string>,
  prevSegs: string[][],
  log: string[],
  signal: AbortSignal,
): Promise<string[]> => {
  const segGlossary: Record<string, string> = {};
  for (const wordJp in glossary) {
    if (seg.some((line) => line.includes(wordJp))) {
      segGlossary[wordJp] = glossary[wordJp];
    }
  }

  let cacheKey: string | undefined;
  if (segCache) {
    try {
      const extra: any = { glossary: segGlossary };
      if (segTranslator instanceof SakuraTranslator) {
        extra.version = (segTranslator as any).version;
        extra.model = (segTranslator as any).model;
      }
      cacheKey = segCache.cacheKey(seg, extra);
      const cached = await segCache.get(cacheKey);
      if (cached && cached.length === seg.length) {
        log.push('读取缓存');
        return cached;
      }
    } catch (e) {
      console.error('读取缓存失败', e);
    }
  }

  log.push('翻译中...');
  const segOutput = await segTranslator.translate(seg, {
    glossary: segGlossary,
    prevSegs,
    signal,
  });

  if (segOutput.length !== seg.length) {
    throw new Error('翻译输出行数不匹配');
  }

  for (let i = 0; i < seg.length; i++) {
    const lineJp = seg[i];
    if (lineJp.trim().length === 0) continue;
    const space = RegexUtil.getLeadingSpaces(lineJp);
    segOutput[i] = space + segOutput[i].trimStart();
  }

  if (segCache && cacheKey !== undefined) {
    try {
      await segCache.save(cacheKey, segOutput);
    } catch (e) {
      console.error('写入缓存失败', e);
    }
  }

  log.push('翻译完成');
  return segOutput;
};

const stopWorker = () => {
  if (!running.value) return;
  controller?.abort();
};

const deleteWorker = () => {
  controller?.abort();
  const worker = props.worker;
  const workspace = useWorkspaceStore(worker.translatorId);
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
  } catch (e: unknown) {
    message.error(`翻译器错误：${e}`);
  }
};

const showEditWorkerModal = ref(false);

const segColor = (seg: WorkspaceSegment) => {
  switch (seg.state) {
    case 'success':
      return '#18a058';
    case 'failed':
      return '#d03050';
    case 'processing':
      return '#2080f0';
    default:
      return '#e0e0e6';
  }
};

const stateLabel = (state: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '翻译中',
    success: '成功',
    failed: '失败',
  };
  return map[state] ?? state;
};

const showModal = ref(false);
const modalSeg = ref<{
  segIndex: number;
  seg: WorkspaceSegment;
} | null>(null);

const onSegClick = (segIndex: number, seg: WorkspaceSegment) => {
  if (seg.state === 'pending') return;
  modalSeg.value = { segIndex, seg };
  showModal.value = true;
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
        {{ endpointPrefix }}{{ translatorConfig.endpoint }}
      </n-text>
    </template>

    <template #description>
      <n-flex :wrap="false" :size="16">
        <n-flex vertical :size="4" style="flex: 1; min-width: 0">
          <n-text depth="3" style="font-size: 12px">
            {{ statusText }}
            <template v-if="concurrency > 1">· 并发 {{ concurrency }}</template>
          </n-text>

          <template v-if="hasStarted">
            <div
              v-if="visibleTasks.length > 0"
              style="
                display: grid;
                grid-template-columns: repeat(50, 14px);
                gap: 2px;
                overflow: hidden;
              "
            >
              <template
                v-for="{ job, taskIndex: ti, chapterNum } in visibleTasks"
                :key="`${job.descriptor}:${ti}`"
              >
                <n-tooltip trigger="hover" :delay="300">
                  <template #trigger>
                    <div
                      style="
                        width: 14px;
                        height: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        color: inherit;
                        opacity: 0.45;
                        font-variant-numeric: tabular-nums;
                        user-select: none;
                        cursor: default;
                      "
                    >
                      {{ chapterNum }}
                    </div>
                  </template>
                  {{ job.tasks[ti].chapterId }}
                </n-tooltip>
                <n-tooltip
                  v-for="(seg, si) in job.tasks[ti].segs"
                  :key="si"
                  trigger="hover"
                  :delay="300"
                >
                  <template #trigger>
                    <div
                      :style="{
                        width: '14px',
                        height: '14px',
                        borderRadius: '2px',
                        backgroundColor: segColor(seg),
                        cursor: seg.state !== 'pending' ? 'pointer' : 'default',
                      }"
                      @click="onSegClick(si, seg)"
                    />
                  </template>
                  章节{{ chapterNum }} 分段{{ si + 1 }}
                  {{ stateLabel(seg.state) }}
                  <template v-if="seg.log.length > 0">
                    <br />
                    {{ seg.log[seg.log.length - 1] }}
                  </template>
                </n-tooltip>
              </template>
            </div>
          </template>
        </n-flex>

        <n-flex
          v-if="hasStarted && taskStats.total > 0"
          vertical
          align="center"
          :size="4"
          style="flex: none"
        >
          <n-progress type="circle" :percentage="progressPercentage" />
          <n-text>
            成功 {{ taskStats.success }}/{{ taskStats.total }}
            <br />
            失败 {{ taskStats.failed }}/{{ taskStats.total }}
          </n-text>
        </n-flex>
      </n-flex>
    </template>

    <template #header-extra>
      <n-flex :size="6" :wrap="false" align="center">
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

  <c-modal
    :show="showModal"
    @update:show="showModal = $event"
    :title="
      modalSeg
        ? `分段 ${modalSeg.segIndex + 1} - ${stateLabel(modalSeg.seg.state)}`
        : ''
    "
  >
    <template v-if="modalSeg">
      <n-flex vertical :size="12">
        <div v-if="modalSeg.seg.log.length > 0">
          <n-text strong>日志</n-text>
          <n-code
            :code="modalSeg.seg.log.join('\n')"
            language="text"
            style="margin-top: 4px; max-height: 200px; overflow: auto"
          />
        </div>
        <div v-if="modalSeg.seg.src.length > 0">
          <n-text strong>原文</n-text>
          <n-code
            :code="modalSeg.seg.src.join('\n')"
            language="text"
            style="margin-top: 4px; max-height: 200px; overflow: auto"
          />
        </div>
        <div v-if="modalSeg.seg.dst.length > 0">
          <n-text strong>译文</n-text>
          <n-code
            :code="modalSeg.seg.dst.join('\n')"
            language="text"
            style="margin-top: 4px; max-height: 200px; overflow: auto"
          />
        </div>
        <n-text v-if="modalSeg.seg.retryCount > 0" depth="3">
          已重试 {{ modalSeg.seg.retryCount }} 次
        </n-text>
      </n-flex>
    </template>
  </c-modal>

  <sakura-worker-modal
    v-if="worker.translatorId === 'sakura'"
    v-model:show="showEditWorkerModal"
    :worker="worker"
  />
  <gpt-worker-modal
    v-else
    v-model:show="showEditWorkerModal"
    :worker="worker"
  />
</template>
