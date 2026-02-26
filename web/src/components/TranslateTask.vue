<script lang="ts" setup>
import type { TranslatorConfig } from '@/domain/translate';
import { translate } from '@/domain/translate';
import type {
  TranslateTaskDesc,
  TranslateTaskParams,
} from '@/model/Translator';
import { releaseKeepAlive, requestKeepAlive } from '@/util';

import CTaskCard from './CTaskCard.vue';

const emit = defineEmits<{
  'update:jp': [number];
  'update:baidu': [number];
  'update:youdao': [number];
  'update:gpt': [number];
  'update:sakura': [number];
  'update:murasaki': [number];
}>();

const message = useMessage();

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

const startTask = async (
  desc: TranslateTaskDesc,
  params: TranslateTaskParams,
  translatorDesc: TranslatorConfig,
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
    message.info('已有任务在运行。');
    return 'fail';
  }

  const buildLabel = () => {
    const idToLaber = {
      baidu: '百度',
      youdao: '有道',
      gpt: 'GPT',
      sakura: 'Sakura',
      murasaki: 'Murasaki',
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

  const onProgressUpdated = () =>
    callback?.onProgressUpdated({
      finished: chapterFinished.value,
      error: chapterError.value,
      total: chapterTotal.value ?? 0,
    });

  await requestKeepAlive();
  const state = await translate(
    desc,
    params,
    {
      onStart: (total) => {
        chapterTotal.value = total;
        onProgressUpdated();
      },
      onChapterSuccess: ({ jp, zh }) => {
        if (jp !== undefined) emit('update:jp', jp);
        if (zh !== undefined) {
          if (translatorDesc.id === 'baidu') {
            emit('update:baidu', zh);
          } else if (translatorDesc.id === 'youdao') {
            emit('update:youdao', zh);
          } else if (translatorDesc.id === 'gpt') {
            emit('update:gpt', zh);
          } else if (translatorDesc.id === 'murasaki') {
            emit('update:murasaki', zh);
          } else {
            emit('update:sakura', zh);
          }
        }
        chapterFinished.value += 1;
        onProgressUpdated();
      },
      onChapterFailure: () => {
        chapterError.value += 1;
        onProgressUpdated();
      },
      log: (message: string, detail?: string[]) => {
        cardRef.value!.pushLog({ message, detail });
      },
    },
    translatorDesc,
    signal,
  );

  cardRef.value!.pushLog({ message: '\n结束' });
  running.value = false;
  releaseKeepAlive();

  if (state === 'abort') {
    return 'abort';
  } else if (
    chapterTotal.value ===
    chapterFinished.value + chapterError.value
  ) {
    return 'complete';
  } else {
    return 'uncomplete';
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
