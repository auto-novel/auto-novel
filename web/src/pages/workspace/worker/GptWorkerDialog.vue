<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import type { Form, FormSchema } from '@nuxt/ui';

import {
  parseWorkerLines,
  validateGptWorker,
  validateGptWorkerBatch,
} from './gptWorkerForm';

import type { GptPipelineWorker } from '@/model/Translator';
import { useGptPipelineWorkspaceStore } from '@/stores';
import {
  openAiProfiles,
  parseOpenAiProfileSelection,
  type openAiProfileId,
  type OpenAiProfileSelection,
  type ProfileValues,
} from '@auto-novel/translator';

const props = defineProps<{
  show: boolean;
  worker?: GptPipelineWorker;
}>();
const emit = defineEmits<{
  'update:show': [boolean];
}>();

const workspace = useGptPipelineWorkspaceStore();
const workspaceRef = workspace.ref;
// ── 编辑模式表单（单翻译器）─────────────────────────────────

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com';
const DEEPSEEK_ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/openai';

/** 新建翻译器时默认使用的接口格式 */
const DEFAULT_PROFILE_ID: openAiProfileId = 'deepseek';

/**
 * 按接口格式自动填入默认端点：
 * Gemini 用谷歌兼容端点，Anthropic 用 DeepSeek 的 /anthropic，，默认 DeepSeek。
 */
const defaultEndpoint = (profileId: openAiProfileId) => {
  if (profileId === 'gemini') return GEMINI_ENDPOINT;
  if (profileId === 'anthropic') return DEEPSEEK_ANTHROPIC_ENDPOINT;
  return DEEPSEEK_ENDPOINT;
};

const initFormValue = (
  worker: GptPipelineWorker | undefined,
): {
  id: string;
  model: string;
  endpoint: string;
  key: string;
  concurrency: number;
  profileId: openAiProfileId;
  profileValues: ProfileValues;
} => {
  // localStorage 的泛型不校验 JSON；旧非法参数回到默认值，保留可识别的接口格式。
  let profile: OpenAiProfileSelection | undefined;
  if (worker?.profile !== undefined) {
    try {
      profile = parseOpenAiProfileSelection(worker.profile);
    } catch {
      const id = openAiProfiles.find((p) => p.id === worker.profile?.id)?.id;
      if (id) profile = parseOpenAiProfileSelection({ id });
      if (props.show) {
        Toast.warning('已保存的模型配置参数无效，已恢复默认参数，请确认后保存');
      }
    }
  }
  const profileId = profile?.id ?? DEFAULT_PROFILE_ID;
  const defaultValues = defaultProfileValues(profileId);

  if (worker === undefined) {
    return {
      id: '',
      model: 'deepseek-v4-pro',
      endpoint: defaultEndpoint(profileId),
      key: '',
      concurrency: 1,
      profileId,
      profileValues: defaultValues,
    };
  } else {
    return {
      id: worker.id,
      model: worker.model,
      endpoint: worker.endpoint,
      key: worker.key,
      concurrency: worker.concurrency,
      profileId,
      profileValues: {
        ...defaultValues,
        ...(profile?.values ?? {}),
      },
    };
  }
};

const formRef = useTemplateRef<Form<FormSchema>>('form');

const formValue = ref(initFormValue(props.worker));

/** 已保存或手动输入的 API 端点不随接口格式切换而覆盖。 */
const preserveEndpoint = ref(Boolean(props.worker?.endpoint.trim()));

const onEndpointInput = (value: string) => {
  formValue.value.endpoint = value;
  preserveEndpoint.value = true;
};

const currentProfile = computed(() =>
  openAiProfiles.find((p) => p.id === formValue.value.profileId),
);

function defaultProfileValues(profileId: openAiProfileId): ProfileValues {
  const profile = openAiProfiles.find((p) => p.id === profileId);
  const values: ProfileValues = {};
  for (const field of profile?.fields ?? []) {
    if (field.type === 'select') {
      values[field.key] = field.options[0].value;
    }
  }
  return values;
}

const onProfileChange = (value: string) => {
  const profile = openAiProfiles.find((profile) => profile.id === value);
  if (!profile) return;
  const id = profile.id;
  formValue.value.profileId = id;
  formValue.value.profileValues = defaultProfileValues(id);
  if (!preserveEndpoint.value) {
    formValue.value.endpoint = defaultEndpoint(id);
  }
};

const otherWorkers = computed(() =>
  workspaceRef.value.workers.filter((worker) => worker.id !== props.worker?.id),
);
const duplicateKeyWarning = computed(() =>
  formValue.value.key.trim() &&
  otherWorkers.value.some((worker) => worker.key === formValue.value.key)
    ? '有重复的Key，请确保使用的API支持并发'
    : undefined,
);

const doValidate = async () =>
  Boolean(await formRef.value?.validate({ silent: true }));

const addFormValue = computed(() => ({
  endpoint: formValue.value.endpoint,
  models: modelText.value,
  keys: keyText.value,
}));

const validateForm = () =>
  props.worker === undefined
    ? validateGptWorkerBatch(addFormValue.value)
    : validateGptWorker(formValue.value, otherWorkers.value);

const modelText = ref('');
const keyText = ref('');
const defaultConcurrency = ref(1);
const keyIds = new Map<string, number>();
const workerNames = reactive<Record<string, string>>({});
const workerConcurrencies = reactive<Record<string, number>>({});

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    formValue.value = initFormValue(props.worker);
    preserveEndpoint.value = Boolean(props.worker?.endpoint.trim());
    if (props.worker === undefined) {
      keyIds.clear();
      modelText.value = '';
      keyText.value = '';
      for (const uid of Object.keys(workerNames)) delete workerNames[uid];
      for (const uid of Object.keys(workerConcurrencies))
        delete workerConcurrencies[uid];
      defaultConcurrency.value = 1;
    }
  },
);

const models = computed(() => [...new Set(parseWorkerLines(modelText.value))]);
const keys = computed(() => parseWorkerLines(keyText.value));

interface GeneratedWorker {
  uid: string;
  id: string;
  model: string;
  key: string;
}

const generatedWorkers = computed<GeneratedWorker[]>(() => {
  const ms = models.value;
  const ks = keys.value;
  if (ms.length === 0 || ks.length === 0) return [];

  const usedIds = new Set(workspaceRef.value.workers.map((w) => w.id));
  const result: GeneratedWorker[] = [];
  for (const model of ms) {
    let suffix = 2;
    for (const key of ks) {
      let id = model;
      while (usedIds.has(id)) {
        id = `${model} (${suffix++})`;
      }
      usedIds.add(id);
      let keyId = keyIds.get(key);
      if (keyId === undefined) {
        keyId = keyIds.size;
        keyIds.set(key, keyId);
      }
      const uid = JSON.stringify([model, keyId]);
      result.push({ uid, id, model, key });
    }
  }
  return result;
});

watch(generatedWorkers, (ws) => {
  const newIds = new Set(ws.map((w) => w.uid));
  for (const key of Object.keys(workerNames)) {
    if (!newIds.has(key)) delete workerNames[key];
  }
  for (const key of Object.keys(workerConcurrencies)) {
    if (!newIds.has(key)) delete workerConcurrencies[key];
  }
  for (const w of ws) {
    if (!(w.uid in workerConcurrencies)) {
      workerConcurrencies[w.uid] = defaultConcurrency.value;
    }
  }
});

const maskKey = (key: string) =>
  key.length > 8 ? `••••${key.slice(-4)}` : '••••';

watch(defaultConcurrency, (val) => {
  for (const w of generatedWorkers.value) {
    workerConcurrencies[w.uid] = val;
  }
});

const workerName = (worker: GeneratedWorker) =>
  (workerNames[worker.uid] ?? worker.id).trim();

const validateIds = (): string | null => {
  const existingIds = new Set(workspaceRef.value.workers.map((w) => w.id));
  const generatedIds = new Set<string>();
  for (const w of generatedWorkers.value) {
    const id = workerName(w);
    if (!id) return '翻译器名字不能为空';
    if (existingIds.has(id)) return `翻译器「${id}」已存在`;
    if (generatedIds.has(id)) return `翻译器名字「${id}」重复`;
    generatedIds.add(id);
  }
  return null;
};

const profileForSave = (): OpenAiProfileSelection | undefined => {
  try {
    return parseOpenAiProfileSelection({
      id: formValue.value.profileId,
      values: formValue.value.profileValues,
    });
  } catch (error) {
    Toast.warning(error instanceof Error ? error.message : '模型配置参数无效');
    return undefined;
  }
};

const addWorkers = (profile: OpenAiProfileSelection) => {
  const endpoint = formValue.value.endpoint.trim();
  for (const w of generatedWorkers.value) {
    workspace.addWorker({
      id: workerName(w),
      model: w.model,
      endpoint,
      key: w.key,
      concurrency: workerConcurrencies[w.uid] ?? defaultConcurrency.value,
      profile,
    });
  }
};

const save = () => {
  if (props.worker === undefined) {
    const idError = validateIds();
    if (idError) {
      Toast.warning(idError);
      return;
    }
    const profile = profileForSave();
    if (!profile) return;
    addWorkers(profile);
    Toast.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
    emit('update:show', false);
  } else {
    const profile = profileForSave();
    if (!profile) return;
    const { id, model, endpoint, key, concurrency } = formValue.value;
    const worker = {
      id: id.trim(),
      model: model.trim(),
      endpoint: endpoint.trim(),
      key: key.trim(),
      concurrency,
      profile,
    };
    const index = workspaceRef.value.workers.findIndex(
      (w) => w.id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    Toast.success(`已更新翻译器「${worker.id}」`);
    emit('update:show', false);
  }
};

const submit = async () => {
  if (await doValidate()) save();
};

const submitAndContinue = async () => {
  if (!(await doValidate())) return;
  const idError = validateIds();
  if (idError) {
    Toast.warning(idError);
    return;
  }
  const profile = profileForSave();
  if (!profile) return;
  addWorkers(profile);
  Toast.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <UModal
    :ui="{ content: 'max-w-[calc(100vw-16px)]' }"
    :open="show"
    @update:open="$emit('update:show', $event)"
    :title="verb + '翻译器'"
    class="w-[min(750px,calc(100%-16px))]"
  >
    <template #body>
      <UForm
        ref="form"
        :state="props.worker === undefined ? addFormValue : formValue"
        :validate="validateForm"
        :validate-on="['input', 'change']"
        :validate-on-input-delay="0"
        class="space-y-5"
        @submit="save"
      >
        <UFormField
          orientation="horizontal"
          :ui="{ container: 'flex-1 min-w-0' }"
          eager-validation
          label="接口格式"
        >
          <USelect
            :model-value="formValue.profileId"
            :items="
              openAiProfiles.map((p) => ({ label: p.label, value: p.id }))
            "
            aria-label="接口格式"
            class="w-full"
            @update:model-value="onProfileChange"
          />
        </UFormField>

        <template v-if="currentProfile?.fields.length">
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            v-for="field in currentProfile.fields"
            :key="`${formValue.profileId}-${field.key}`"
            :label="field.label"
          >
            <USelect
              v-if="field.type === 'select'"
              :model-value="
                String(
                  field.options.findIndex(
                    (option) =>
                      option.value === formValue.profileValues[field.key],
                  ),
                )
              "
              :items="
                field.options.map((option, index) => ({
                  label: option.label,
                  value: String(index),
                }))
              "
              :aria-label="field.label"
              class="w-full"
              @update:model-value="
                (value) =>
                  (formValue.profileValues[field.key] =
                    field.options[Number(value)]?.value)
              "
            />
          </UFormField>
        </template>
        <!-- 添加模式：批量 -->
        <template v-if="props.worker === undefined">
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="endpoint"
            label="API端点"
          >
            <UInput
              class="w-full"
              :model-value="formValue.endpoint"
              :placeholder="defaultEndpoint(formValue.profileId)"
              @update:model-value="onEndpointInput"
            />
          </UFormField>

          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="models"
            label="模型"
          >
            <UTextarea
              class="w-full"
              v-model="modelText"
              placeholder="每行一个模型名&#10;deepseek-v4-pro&#10;deepseek-v4-flash"
              autoresize
              :rows="2"
              :maxrows="5"
            />
          </UFormField>

          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="keys"
            label="Key"
          >
            <UTextarea
              class="w-full"
              v-model="keyText"
              placeholder="每行一个Key&#10;sk-xxxxxxxx&#10;sk-yyyyyyyy"
              autoresize
              :rows="2"
              :maxrows="5"
            />
          </UFormField>

          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            label="默认并发"
          >
            <UInputNumber
              class="w-full"
              v-model="defaultConcurrency"
              :min="1"
              :max="100"
            />
          </UFormField>

          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            v-if="generatedWorkers.length > 0"
            label="预览"
          >
            <n-table :single-line="false" size="small">
              <thead>
                <tr>
                  <th>显示名称</th>
                  <th>模型</th>
                  <th>Key</th>
                  <th class="w-20">并发</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="w in generatedWorkers" :key="w.uid">
                  <td>
                    <UInput
                      class="w-full"
                      :model-value="workerNames[w.uid] ?? w.id"
                      :placeholder="w.id"
                      size="sm"
                      aria-label="翻译器显示名称"
                      @update:model-value="workerNames[w.uid] = $event"
                    />
                  </td>
                  <td>{{ w.model }}</td>
                  <td class="text-[12px] font-[monospace]">
                    {{ maskKey(w.key) }}
                  </td>
                  <td>
                    <input
                      type="number"
                      :class="[
                        'w-15 rounded-sm border border-divider px-1 py-0.5 text-center',
                        'text-[13px] outline-none transition-[border-color] duration-200',
                        'focus:border-primary [&::-webkit-inner-spin-button]:m-0',
                        '[&::-webkit-inner-spin-button]:appearance-none',
                        '[&::-webkit-outer-spin-button]:m-0',
                        '[&::-webkit-outer-spin-button]:appearance-none',
                      ]"
                      :value="workerConcurrencies[w.uid]"
                      min="1"
                      max="100"
                      @input="
                        workerConcurrencies[w.uid] = Number(
                          ($event.target as HTMLInputElement).value,
                        )
                      "
                    />
                  </td>
                </tr>
              </tbody>
            </n-table>
          </UFormField>
        </template>

        <!-- 编辑模式：单个 -->
        <template v-else>
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="id"
            label="名字"
          >
            <UInput
              class="w-full"
              v-model="formValue.id"
              placeholder="给你的翻译器起个名字"
            />
          </UFormField>
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="model"
            label="模型"
          >
            <UInput
              class="w-full"
              v-model="formValue.model"
              placeholder="deepseek-v4-pro"
            />
          </UFormField>
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="endpoint"
            label="API端点"
          >
            <UInput
              class="w-full"
              :model-value="formValue.endpoint"
              :placeholder="defaultEndpoint(formValue.profileId)"
              @update:model-value="onEndpointInput"
            />
          </UFormField>
          <UFormField
            orientation="horizontal"
            eager-validation
            name="key"
            label="Key"
            :help="duplicateKeyWarning"
            :ui="{ container: 'flex-1 min-w-0', help: 'text-warning' }"
          >
            <UInput
              class="w-full"
              v-model="formValue.key"
              placeholder="API Key"
            />
          </UFormField>
          <UFormField
            orientation="horizontal"
            :ui="{ container: 'flex-1 min-w-0' }"
            eager-validation
            name="concurrency"
            label="并发数"
          >
            <UInputNumber
              class="w-full"
              v-model="formValue.concurrency"
              :min="1"
              :max="100"
            />
          </UFormField>
        </template>
      </UForm>
    </template>
    <template #footer>
      <div class="flex flex-wrap gap-3" v-if="props.worker === undefined">
        <ActionButton :action="submitAndContinue">添加并继续</ActionButton>
        <ActionButton color="primary" :action="submit" variant="solid">
          添加
        </ActionButton>
      </div>
      <ActionButton v-else color="primary" :action="submit" variant="solid">
        更新
      </ActionButton>
    </template>
  </UModal>
</template>
