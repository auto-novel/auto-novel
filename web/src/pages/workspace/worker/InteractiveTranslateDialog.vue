<script lang="ts" setup>
import {
  Toast,
  copyToClipboard,
  XDialog,
  useWebKitViewport,
} from '@novelia/web-kit';
import {
  OpenAiTranslator,
  SakuraTranslator,
  TranslationPipeline,
} from '@auto-novel/translator';
import type { SegmentTracker } from '@auto-novel/translator';

import InteractiveGlossaryPanel from './InteractiveGlossaryPanel.vue';

import { downloadFile } from '@/util';

import type { Glossary } from '@/model/Glossary';
import type { GptPipelineWorker, SakuraWorker } from '@/model/Translator';
import type { TranslatorId } from '@/domain/translator/TranslationTask/types';

const props = defineProps<{
  show: boolean;
  translatorId: TranslatorId;
  worker: GptPipelineWorker | SakuraWorker;
  running: boolean;
}>();

const emit = defineEmits<{
  'update:show': [boolean];
}>();

const { isMobile } = useWebKitViewport();
const themeVars = useThemeVars();

const isSakura = computed(() => props.translatorId === 'sakura');
const title = computed(() => `试译 · ${props.worker.id}`);
const workerMeta = computed(() => {
  if (isSakura.value) {
    return `Sakura · ${(props.worker as SakuraWorker).endpoint}`;
  }
  const worker = props.worker as GptPipelineWorker;
  return `GPT · ${worker.model}@${worker.endpoint}`;
});

const textJp = ref('');
const textZh = ref('');
const glossary = ref<Glossary>({});
const rightView = ref<'result' | 'glossary'>('result');
const phase = ref<'idle' | 'connecting' | 'translating'>('idle');
const error = ref<string>();
const warning = ref<string>();
// 上次翻译对应的原文，用于判断译文是否已过期
const translatedSource = ref('');
const progress = ref({ done: 0, total: 0 });
const copied = ref(false);
const resultPaneRef = ref<HTMLElement | null>(null);

const isBusy = computed(() => phase.value !== 'idle');
const canTranslate = computed(() => textJp.value.trim().length > 0);
const glossaryCount = computed(() => Object.keys(glossary.value).length);
const isStale = computed(
  () =>
    textZh.value.length > 0 &&
    translatedSource.value.length > 0 &&
    textJp.value !== translatedSource.value,
);

const progressPercentage = computed(() => {
  if (progress.value.total <= 0) return 0;
  return Math.min(
    100,
    Math.round((progress.value.done / progress.value.total) * 100),
  );
});

const statusText = computed(() => {
  if (phase.value === 'connecting') return '正在连接翻译器…';
  if (phase.value === 'translating') return '翻译中';
  if (error.value) return '翻译失败';
  if (warning.value) return '部分失败';
  if (textZh.value) return isStale.value ? '译文已过期' : '完成';
  if (props.running) return '就绪 · 本次会额外占用 1 并发';
  return '就绪';
});

const statusTone = computed(() => {
  if (error.value) return 'error';
  if (warning.value || isStale.value) return 'warning';
  if (textZh.value) return 'success';
  return 'idle';
});

// 弹窗随时可能被关闭，草稿按翻译器保存在当前标签页，避免误关丢稿
interface Draft {
  source: string;
  result: string;
  translatedSource: string;
  glossary: Glossary;
  error?: string;
  warning?: string;
}

const draftKey = computed(
  () => `interactive-translate:${props.translatorId}:${props.worker.id}`,
);

let draftTimer: number | undefined;

const persistDraft = () => {
  if (draftTimer !== undefined) {
    clearTimeout(draftTimer);
    draftTimer = undefined;
  }
  try {
    const hasGlossary = Object.keys(glossary.value).length > 0;
    if (!textJp.value && !textZh.value && !hasGlossary) {
      sessionStorage.removeItem(draftKey.value);
      return;
    }
    const draft: Draft = {
      source: textJp.value,
      result: textZh.value,
      translatedSource: translatedSource.value,
      glossary: { ...glossary.value },
      error: error.value,
      warning: warning.value,
    };
    sessionStorage.setItem(draftKey.value, JSON.stringify(draft));
  } catch (e) {
    console.warn('保存试译草稿失败', e);
  }
};

// 放宽到 5 万字后，输入时不再每个按键都同步写 sessionStorage
const schedulePersistDraft = () => {
  if (draftTimer !== undefined) clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = undefined;
    persistDraft();
  }, 500);
};

const sanitizeGlossary = (value: unknown): Glossary => {
  if (typeof value !== 'object' || value === null) return {};
  const result: Glossary = {};
  for (const [jp, zh] of Object.entries(value)) {
    if (typeof zh === 'string') result[jp] = zh;
  }
  return result;
};

const restoreDraft = () => {
  try {
    const raw = sessionStorage.getItem(draftKey.value);
    if (!raw) return;
    const draft = JSON.parse(raw) as Partial<Draft>;
    if (typeof draft.source === 'string') textJp.value = draft.source;
    if (typeof draft.result === 'string') textZh.value = draft.result;
    if (typeof draft.error === 'string') error.value = draft.error;
    if (typeof draft.warning === 'string') warning.value = draft.warning;
    if (typeof draft.translatedSource === 'string') {
      translatedSource.value = draft.translatedSource;
    }
    if (draft.glossary !== undefined) {
      glossary.value = sanitizeGlossary(draft.glossary);
    }
  } catch (e) {
    console.warn('恢复试译草稿失败', e);
  }
};

let translatorPromise: Promise<OpenAiTranslator | SakuraTranslator> | undefined;
let controller: AbortController | undefined;
let generation = 0;
let copiedTimer: number | undefined;

watch(
  () => props.worker,
  () => {
    translatorPromise = undefined;
  },
);

const getTranslator = () => {
  // Sakura 初始化暂不支持 AbortSignal；保留同一个 Promise，避免停止后重试
  // 叠加模型探测请求。任务结果仍由 generation 隔离。
  translatorPromise ??= (
    isSakura.value
      ? SakuraTranslator.create(props.worker as SakuraWorker)
      : Promise.resolve(new OpenAiTranslator(props.worker as GptPipelineWorker))
  ).catch((e: unknown) => {
    translatorPromise = undefined;
    throw e;
  });
  return translatorPromise;
};

const resetCopied = () => {
  copied.value = false;
  if (copiedTimer !== undefined) {
    clearTimeout(copiedTimer);
    copiedTimer = undefined;
  }
};

const revealResult = () => {
  if (!isMobile.value) return;
  void nextTick(() => {
    resultPaneRef.value?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  });
};

const cancel = (notify = false) => {
  const busy = isBusy.value;
  const connecting = phase.value === 'connecting';
  generation++;
  controller?.abort();
  controller = undefined;
  phase.value = 'idle';
  progress.value = { done: 0, total: 0 };
  if (notify && busy) {
    Toast.info(
      connecting && isSakura.value
        ? '已停止本次翻译；模型探测仍在后台进行，重试会复用该请求'
        : '已取消翻译',
    );
  }
};

const translate = async () => {
  if (isBusy.value) return;

  const sourceSnapshot = textJp.value;
  const source = sourceSnapshot.replace(/\r\n?/g, '\n');
  if (source.trim().length === 0) {
    Toast.info('请输入需要翻译的文本');
    return;
  }

  // 移动端开始翻译时收起键盘，避免遮住译文；桌面端保留焦点以便再次快捷键翻译
  if (isMobile.value && typeof document !== 'undefined') {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  const current = ++generation;
  const abortController = new AbortController();
  controller = abortController;

  // 翻译开始后回到译文视图，进度和结果始终可见
  rightView.value = 'result';
  phase.value = 'connecting';
  textZh.value = '';
  translatedSource.value = '';
  error.value = undefined;
  warning.value = undefined;
  progress.value = { done: 0, total: 0 };
  resetCopied();

  let pipeline: TranslationPipeline | undefined;
  let segmentErrors = 0;
  let firstSegmentError: string | undefined;
  const tracker: SegmentTracker = {
    onSegmentsReady: (_lines, ranges) => {
      progress.value = { done: 0, total: ranges.length };
    },
    onSegComplete: () => {
      progress.value.done += 1;
    },
    onSegError: (_order, reason) => {
      segmentErrors += 1;
      progress.value.done += 1;
      firstSegmentError ??=
        reason instanceof Error ? reason.message : String(reason);
    },
  };

  try {
    const t = await getTranslator();
    if (current !== generation) return;

    phase.value = 'translating';
    pipeline = new TranslationPipeline(
      100,
      undefined,
      undefined,
      isSakura.value ? 'chapter' : 'segment',
    );
    pipeline.registerTranslator(t, 1);

    const result = await pipeline.translate(
      source,
      glossary.value,
      undefined,
      abortController.signal,
      tracker,
    );
    if (current !== generation) return;

    textZh.value = result;
    translatedSource.value = sourceSnapshot;

    const issues: string[] = [];
    if (segmentErrors > 0) {
      const detail = `${segmentErrors} 个分段未成功，失败部分已保留原文。原因：${firstSegmentError}`;
      if (segmentErrors === progress.value.total) {
        error.value = detail;
      } else {
        issues.push(detail);
      }
    }
    if (source.split('\n').length !== result.split('\n').length) {
      issues.push('译文行数与原文不一致，请检查结果');
    }
    if (issues.length > 0) warning.value = issues.join('；') + '。';

    revealResult();
  } catch (e) {
    if (current !== generation || abortController.signal.aborted) return;
    error.value = e instanceof Error ? e.message : String(e);
    revealResult();
  } finally {
    pipeline?.clearLoops();
    pipeline?.queue.clear();
    if (current === generation) {
      phase.value = 'idle';
      if (controller === abortController) controller = undefined;
    }
  }
};

const toggleGlossary = () => {
  if (isBusy.value) return;
  rightView.value = rightView.value === 'glossary' ? 'result' : 'glossary';
};

const onTranslateClick = () => {
  if (isBusy.value) {
    cancel(true);
    return;
  }
  void translate();
};

const onInputKeydown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
  event.preventDefault();
  if (isBusy.value) return;
  void translate();
};

const clear = () => {
  if (isBusy.value) return;
  textJp.value = '';
  textZh.value = '';
  translatedSource.value = '';
  error.value = undefined;
  warning.value = undefined;
  progress.value = { done: 0, total: 0 };
  resetCopied();
  // 术语表属于本次翻译工作区，清空文本时不一起丢弃
  persistDraft();
};

const copyTranslation = async () => {
  if (!textZh.value) return;
  try {
    await copyToClipboard(textZh.value);
    Toast.success('译文已复制到剪贴板');
    copied.value = true;
    if (copiedTimer !== undefined) clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = undefined;
    }, 1500);
  } catch {
    Toast.error('复制失败');
  }
};

const downloadTranslation = () => {
  if (!textZh.value) return;
  const base = (props.worker.id.trim() || '试译').slice(0, 60);
  const filename = `${base}-译文.txt`.replace(/[\\/:*?"<>|]/g, '_');
  downloadFile(
    filename,
    new Blob([textZh.value], { type: 'text/plain;charset=utf-8' }),
  );
};

// 错误和警告属于上次结果，编辑原文不能抹去失败信息。
watch(
  [textJp, textZh, translatedSource, glossary, error, warning],
  schedulePersistDraft,
  { deep: true },
);

let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  resetCopied();
  cancel();
  persistDraft();
};

watch(
  () => props.show,
  (show) => {
    if (show) cleanedUp = false;
    else cleanup();
  },
  { flush: 'sync' },
);

onMounted(restoreDraft);
onUnmounted(cleanup);

const handleOpenChange = (open: boolean) => {
  emit('update:show', open);
};
</script>

<template>
  <XDialog
    :open="show"
    :title="title"
    class="w-[800px] max-w-[95vw]"
    @update:open="handleOpenChange"
  >
    <template #description>
      <span class="description-row">
        <span class="worker-meta" :title="workerMeta">{{ workerMeta }}</span>
        <c-button
          class="glossary-toggle"
          :label="
            rightView === 'glossary'
              ? isMobile
                ? '返回翻译'
                : '返回译文'
              : `术语表 ${glossaryCount}`
          "
          :type="rightView === 'glossary' ? 'primary' : 'default'"
          secondary
          :round="false"
          size="small"
          :disabled="isBusy"
          @action="toggleGlossary"
        />
      </span>
    </template>

    <div v-if="isMobile && rightView === 'glossary'" class="mobile-glossary">
      <span class="pane-title">术语表</span>
      <div class="mobile-glossary-body">
        <interactive-glossary-panel v-model:value="glossary" />
      </div>
    </div>
    <div v-else class="interactive-grid">
      <section class="pane">
        <div class="pane-head">
          <span class="pane-title">原文</span>
        </div>
        <n-input
          v-model:value="textJp"
          type="textarea"
          placeholder="输入需要翻译的文本"
          :rows="isMobile ? 6 : 14"
          show-count
          :maxlength="50000"
          :readonly="isBusy"
          :input-props="{
            spellcheck: false,
            'aria-label': '原文',
          }"
          @keydown="onInputKeydown"
        />
      </section>

      <section ref="resultPaneRef" class="pane">
        <div class="pane-head">
          <span class="pane-title">
            {{ rightView === 'glossary' ? '术语表' : '译文' }}
          </span>
          <n-tag
            v-if="rightView === 'result' && isStale"
            size="tiny"
            type="warning"
            :bordered="false"
          >
            原文已修改
          </n-tag>
          <span v-if="rightView === 'result' && textZh" class="pane-count">
            {{ textZh.length }} 字
          </span>
          <c-button
            v-if="rightView === 'result'"
            class="pane-tool"
            :label="copied ? '已复制' : '复制'"
            secondary
            :round="false"
            :size="isMobile ? 'small' : 'tiny'"
            :disabled="isBusy || !textZh"
            @action="copyTranslation"
          />
          <c-button
            v-if="rightView === 'result'"
            label="下载 TXT"
            title="下载译文为 txt 文件"
            secondary
            :round="false"
            :size="isMobile ? 'small' : 'tiny'"
            :disabled="isBusy || !textZh"
            @action="downloadTranslation"
          />
        </div>
        <div class="result-body">
          <n-alert
            v-if="error"
            type="error"
            :bordered="false"
            title="翻译失败"
            role="alert"
          >
            <pre class="notice-text">{{ error }}</pre>
          </n-alert>
          <n-alert
            v-else-if="warning"
            type="warning"
            :bordered="false"
            title="部分失败"
          >
            <pre class="notice-text">{{ warning }}</pre>
          </n-alert>
          <div class="result-input-area">
            <n-input
              v-model:value="textZh"
              type="textarea"
              placeholder="译文会显示在这里"
              :rows="isMobile ? 6 : 14"
              readonly
              :class="{ 'result-input-hidden': rightView === 'glossary' }"
              :input-props="{
                spellcheck: false,
                'aria-label': '译文',
              }"
              @keydown="onInputKeydown"
            />
            <div
              v-if="!isMobile && rightView === 'glossary'"
              class="glossary-overlay"
            >
              <interactive-glossary-panel v-model:value="glossary" />
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="interactive-footer">
        <div class="status-area">
          <n-spin v-if="isBusy" :size="12" />
          <span
            v-else
            class="status-dot"
            :class="statusTone"
            aria-hidden="true"
          />
          <span class="status-text" role="status" aria-live="polite">
            {{ statusText }}
          </span>
          <template v-if="phase === 'translating' && progress.total > 0">
            <span class="status-detail">
              {{ progress.done }} / {{ progress.total }} 段
            </span>
            <n-progress
              class="status-progress"
              type="line"
              :percentage="progressPercentage"
              :height="4"
              :show-indicator="false"
            />
          </template>
          <span v-if="!isBusy && !textJp && !textZh" class="status-hint">
            Ctrl/⌘ + Enter 翻译
          </span>
          <span v-else-if="!isBusy" class="status-hint">草稿自动保存</span>
        </div>
        <n-flex
          align="center"
          :size="8"
          :wrap="true"
          :justify="isMobile ? 'start' : 'end'"
        >
          <c-button
            label="清空文本"
            text
            :round="false"
            :size="isMobile ? 'medium' : 'small'"
            :disabled="isBusy || (!textJp && !textZh)"
            @action="clear"
          />
          <c-button
            :label="isBusy ? '停止' : '翻译'"
            :type="isBusy ? 'warning' : 'primary'"
            :round="false"
            :size="isMobile ? 'medium' : 'small'"
            :disabled="!isBusy && !canTranslate"
            @action="onTranslateClick"
          />
        </n-flex>
      </div>
    </template>
  </XDialog>
</template>

<style scoped>
.interactive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.pane {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.pane-head {
  display: flex;
  min-height: 24px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pane-title {
  font-size: 12px;
  font-weight: 600;
  color: v-bind('themeVars.textColor2');
}

.pane-count {
  font-size: 11px;
  color: v-bind('themeVars.textColor3');
  font-variant-numeric: tabular-nums;
}

.pane-tool {
  margin-left: auto;
}

.description-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.worker-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.glossary-toggle {
  flex: none;
  white-space: nowrap;
}

.result-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.result-input-area {
  position: relative;
}

.result-input-hidden {
  visibility: hidden;
}

.glossary-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--color-modal);
}

.mobile-glossary {
  display: flex;
  height: min(56dvh, 460px);
  min-height: 300px;
  flex-direction: column;
  gap: 6px;
}

.mobile-glossary-body {
  flex: 1;
  min-height: 0;
}

.notice-text {
  margin: 0;
  max-height: 120px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.interactive-footer {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
}

.status-area {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  font-size: 12px;
  color: v-bind('themeVars.textColor3');
}

.status-text {
  white-space: nowrap;
}

.status-detail {
  font-variant-numeric: tabular-nums;
}

.status-progress {
  width: 72px;
  flex: none;
}

.status-hint {
  font-size: 11px;
  opacity: 0.7;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: v-bind('themeVars.textColor3');
}

.status-dot.success {
  background: v-bind('themeVars.successColor');
}

.status-dot.warning {
  background: v-bind('themeVars.warningColor');
}

.status-dot.error {
  background: v-bind('themeVars.errorColor');
}

@media (min-width: 768px) {
  .interactive-footer {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

@media (max-width: 767px) {
  .interactive-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .status-hint {
    display: none;
  }
}
</style>
