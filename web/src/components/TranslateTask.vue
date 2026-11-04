<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';

import {
  runTranslationTask,
  type SingleTaskTranslatorConfig,
  type TranslateTaskDesc,
  type TranslateTaskOptions,
} from '@/domain/translator';
import { releaseKeepAlive, requestKeepAlive } from '@/util';

import CTaskCard from './CTaskCard.vue';

const emit = defineEmits<{
  'update:jp': [number];
  'update:youdao': [number];
  'update:sakura': [number];
}>();

const title = ref('');
const chapterTotal = ref<number>();
const chapterFinished = ref(0);
const chapterError = ref(0);

const percentage = computed(() => {
  const processed = chapterFinished.value + chapterError.value;
  const total = chapterTotal.value ?? 1;
  return total === 0 ? 100 : Math.round((1000 * processed) / total) / 10;
});

const running = ref(false);
const cardRef = ref<InstanceType<typeof CTaskCard>>();
let taskController: AbortController | undefined;
onUnmounted(() => taskController?.abort());

const startTask = async (
  desc: TranslateTaskDesc,
  params: TranslateTaskOptions,
  translatorDesc: SingleTaskTranslatorConfig,
  callback?: {
    onProgressUpdated: (progress: {
      finished: number;
      error: number;
      total: number;
    }) => void;
  },
  signal?: AbortSignal,
) => {
  if (running.value) {
    Toast.info('已有任务在运行。');
    return 'fail';
  }

  const buildLabel = () => {
    const idToLaber = {
      youdao: '有道',
      sakura: 'Sakura',
    };
    let label = `${idToLaber[translatorDesc.id]}翻译`;
    const suffixParts: string[] = [];
    if (params.level === 'expire') {
      suffixParts.push('过期章节');
    } else if (params.level === 'all') {
      suffixParts.push('全部章节');
    } else if (params.level === 'sync') {
      suffixParts.push('源站同步');
    }
    if (params.forceMetadata) {
      suffixParts.push('重翻目录');
    }
    if (desc.type === 'web' && params.useBrowserCrawler) {
      suffixParts.push('浏览器爬虫');
    }
    if (suffixParts.length > 0) {
      label = label + ` [${suffixParts.join('/')}]`;
    }
    return label;
  };

  running.value = true;
  cardRef.value!.clearLog();

  title.value = buildLabel();
  chapterTotal.value = undefined;
  chapterFinished.value = 0;
  chapterError.value = 0;

  const controller = new AbortController();
  taskController = controller;
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();

  try {
    await requestKeepAlive();
    return await runTranslationTask(
      desc,
      params,
      translatorDesc,
      {
        onProgressUpdated: (progress) => {
          chapterTotal.value = progress.total;
          chapterFinished.value = progress.finished;
          chapterError.value = progress.error;
          callback?.onProgressUpdated(progress);
        },
        onChapterSaved: ({ jp, zh }) => {
          if (jp !== undefined) emit('update:jp', jp);
          if (zh !== undefined) {
            if (translatorDesc.id === 'youdao') {
              emit('update:youdao', zh);
            } else {
              emit('update:sakura', zh);
            }
          }
        },
        log: (message, detail) => {
          cardRef.value?.pushLog({
            message,
            detail: detail === undefined ? undefined : [...detail],
          });
        },
      },
      controller.signal,
    );
  } finally {
    signal?.removeEventListener('abort', onAbort);
    taskController = undefined;
    cardRef.value?.pushLog({ message: '\n结束' });
    running.value = false;
    releaseKeepAlive();
  }
};

defineExpose({ startTask });
</script>

<template>
  <c-task-card ref="cardRef" :title="title" :running="running">
    <n-flex align="center" vertical size="large" style="flex: none">
      <n-progress type="circle" :percentage="percentage" />
      <n-text>
        成功 {{ chapterFinished }}/{{ chapterTotal ?? '-' }}
        <br />
        失败 {{ chapterError }}/{{ chapterTotal ?? '-' }}
      </n-text>
    </n-flex>
  </c-task-card>
</template>
