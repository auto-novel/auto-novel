<script lang="ts" setup>
import type { TranslatorConfig } from '@/domain/translate';
import { Translator } from '@/domain/translate';
import type { Glossary } from '@/model/Glossary';
import type {
  GptWorker,
  MurasakiWorker,
  SakuraWorker,
  TranslatorId,
} from '@/model/Translator';
import {
  useGptWorkspaceStore,
  useMurasakiWorkspaceStore,
  useSakuraWorkspaceStore,
} from '@/stores';

const message = useMessage();

const textJp = ref('');
const textZh = ref('');

const translatorId = ref<TranslatorId>('sakura');
const translationOptions: { label: string; value: TranslatorId }[] = [
  { label: '百度', value: 'baidu' },
  { label: '有道', value: 'youdao' },
  { label: 'GPT', value: 'gpt' },
  { label: 'Sakura', value: 'sakura' },
  { label: 'Murasaki', value: 'murasaki' },
];

watch(textJp, () => {
  textZh.value = '';
});
watch(translatorId, () => {
  textZh.value = '';
});

const gptWorkspaceRef = useGptWorkspaceStore().ref;
const selectedGptWorkerId = ref(gptWorkspaceRef.value.workers[0]?.id);

const sakuraWorkspaceRef = useSakuraWorkspaceStore().ref;
const selectedSakuraWorkerId = ref(sakuraWorkspaceRef.value.workers[0]?.id);
const murasakiWorkspaceRef = useMurasakiWorkspaceStore().ref;
const selectedMurasakiWorkerId = ref(murasakiWorkspaceRef.value.workers[0]?.id);

interface SavedTranslation {
  id: TranslatorId;
  workerId?: string;
  endpoint?: string;
  jp: string;
  zh: string;
}
const savedTranslation = ref<SavedTranslation[]>([]);

const glossary = ref<Glossary>({});

const translate = async () => {
  let config: TranslatorConfig;
  let selectedWorker: GptWorker | SakuraWorker | MurasakiWorker | undefined;
  const id = translatorId.value;
  if (id === 'gpt') {
    const worker = gptWorkspaceRef.value.workers.find(
      (it) => it.id === selectedGptWorkerId.value,
    );
    if (worker === undefined) {
      message.error('未选择GPT翻译器');
      return;
    }
    selectedWorker = worker;
    config = {
      id,
      type: worker.type,
      model: worker.model,
      endpoint: worker.endpoint,
      key: worker.key,
    };
  } else if (id === 'sakura') {
    const worker = sakuraWorkspaceRef.value.workers.find(
      (it) => it.id === selectedSakuraWorkerId.value,
    );
    if (worker === undefined) {
      message.error('未选择Sakura翻译器');
      return;
    }
    selectedWorker = worker;
    config = {
      id,
      endpoint: worker.endpoint,
      segLength: worker.segLength,
      prevSegLength: worker.prevSegLength,
    };
  } else if (id === 'murasaki') {
    const worker = murasakiWorkspaceRef.value.workers.find(
      (it) => it.id === selectedMurasakiWorkerId.value,
    );
    if (worker === undefined) {
      message.error('未选择Murasaki翻译器');
      return;
    }
    selectedWorker = worker;
    config = {
      id,
      endpoint: worker.endpoint,
      segLength: worker.segLength,
      prevSegLength: worker.prevSegLength,
    };
  } else {
    config = {
      id,
    };
  }

  try {
    const translator = await Translator.create(config, false);
    const linesJp = textJp.value.split('\n');
    const linesZh = await translator.translate(linesJp, {
      glossary: glossary.value,
    });
    textZh.value = linesZh.join('\n');
  } catch (e: unknown) {
    message.error(`翻译器错误：${e}`);
  }

  savedTranslation.value.push({
    id,
    workerId: selectedWorker?.id,
    endpoint: selectedWorker?.endpoint,
    jp: textJp.value,
    zh: textZh.value,
  });
};
const clearTranslation = () => {
  textJp.value = '';
  textZh.value = '';
};
const copyToClipboard = () => {
  navigator.clipboard.writeText(textZh.value);
  message.info('已经将翻译结果复制到剪切板');
};
const clearSavedTranslation = () => {
  savedTranslation.value = [];
};
</script>

<template>
  <div class="layout-content">
    <n-h1>交互翻译</n-h1>

    <n-flex vertical>
      <c-action-wrapper title="翻译">
        <n-flex vertical>
          <c-radio-group
            v-model:value="translatorId"
            :options="translationOptions"
            size="small"
          />

          <n-radio-group
            v-if="translatorId === 'gpt'"
            v-model:value="selectedGptWorkerId"
          >
            <n-flex vertical>
              <n-radio
                v-for="worker of gptWorkspaceRef.workers"
                :key="worker.id"
                :value="worker.id"
              >
                {{ worker.id }}
                <n-text depth="3">
                  {{ worker.model }}@{{
                    worker.endpoint ? worker.endpoint : 'default'
                  }}
                </n-text>
              </n-radio>
            </n-flex>
          </n-radio-group>

          <n-radio-group
            v-if="translatorId === 'sakura'"
            v-model:value="selectedSakuraWorkerId"
          >
            <n-flex vertical>
              <n-radio
                v-for="worker of sakuraWorkspaceRef.workers"
                :key="worker.id"
                :value="worker.id"
              >
                {{ worker.id }}
                <n-text depth="3">
                  {{ worker.endpoint }}
                </n-text>
              </n-radio>
            </n-flex>
          </n-radio-group>

          <n-radio-group
            v-if="translatorId === 'murasaki'"
            v-model:value="selectedMurasakiWorkerId"
          >
            <n-flex vertical>
              <n-radio
                v-for="worker of murasakiWorkspaceRef.workers"
                :key="worker.id"
                :value="worker.id"
              >
                {{ worker.id }}
                <n-text depth="3">
                  {{ worker.endpoint }}
                </n-text>
              </n-radio>
            </n-flex>
          </n-radio-group>
        </n-flex>
      </c-action-wrapper>

      <c-action-wrapper title="操作">
        <n-flex style="margin-bottom: 16px">
          <n-button-group size="small">
            <c-button label="翻译" :round="false" @action="translate" />
            <c-button label="清空" :round="false" @action="clearTranslation" />
          </n-button-group>

          <glossary-button :value="glossary" :round="false" size="small" />

          <c-button
            label="复制到剪贴板"
            :round="false"
            size="small"
            @action="copyToClipboard"
          />
        </n-flex>
      </c-action-wrapper>
    </n-flex>

    <n-input-group>
      <n-input
        v-model:value="textJp"
        placeholder="输入需要翻译的文本"
        type="textarea"
        :autosize="{ minRows: 15 }"
        show-count
        :maxlength="5000"
        style="flex: 1"
        :input-props="{ spellcheck: false }"
      />

      <n-input
        v-model:value="textZh"
        readonly
        placeholder="翻译结果"
        type="textarea"
        :autosize="{ minRows: 15 }"
        show-count
        style="flex: 1"
        :input-props="{ spellcheck: false }"
      />
    </n-input-group>

    <section-header title="翻译历史">
      <c-button label="清空" @action="clearSavedTranslation" />
    </section-header>

    <n-empty v-if="savedTranslation.length === 0" description="没有翻译历史" />
    <n-list>
      <n-list-item v-for="t of savedTranslation" :key="t.id">
        <n-thing content-indented>
          <template #avatar>
            <n-icon-wrapper
              :size="12"
              :border-radius="0"
              style="margin-top: 5px"
            />
          </template>

          <template #header>
            {{ t.id }}
            {{ t.workerId }}
            <n-text depth="3" style="font-size: 12px; padding-left: 2px">
              {{ t.endpoint }}
            </n-text>
          </template>

          <template #description>
            <n-collapse style="margin-top: 16px">
              <n-collapse-item title="日文">
                <template v-for="line of t.jp.split('\n')" :key="line">
                  {{ line }}
                  <br />
                </template>
              </n-collapse-item>
              <n-collapse-item title="中文">
                <template v-for="line of t.zh.split('\n')" :key="line">
                  {{ line }}
                  <br />
                </template>
              </n-collapse-item>
            </n-collapse>
          </template>
        </n-thing>
      </n-list-item>
    </n-list>
  </div>
</template>
