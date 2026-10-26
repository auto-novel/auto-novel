<script lang="ts" setup>
import { Toast, XSelect, XDialog } from '@novelia/web-kit';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

import type { GptPipelineWorker } from '@/model/Translator';
import { useGptPipelineWorkspaceStore } from '@/stores';
import {
  openAiProfiles,
  type openAiProfileId,
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
  const profileId = worker?.profile?.id ?? DEFAULT_PROFILE_ID;
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
        ...(worker.profile?.values ?? {}),
      },
    };
  }
};

const formRef = useTemplateRef<FormInst>('form');
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

watch(
  () => props.worker,
  (newWorker) => {
    formValue.value = initFormValue(newWorker);
    preserveEndpoint.value = Boolean(newWorker?.endpoint.trim());
  },
  { immediate: false },
);

const emptyCheck = (name: string) => ({
  validator: (rule: FormItemRule, value: string) => value.trim().length > 0,
  message: name + '不能为空',
  trigger: 'input',
});

const editFormRules: FormRules = {
  id: [
    emptyCheck('名字'),
    {
      validator: (rule: FormItemRule, value: string) =>
        workspaceRef.value.workers
          .filter((w) => w.id !== props.worker?.id)
          .find((w) => w.id === value) === undefined,
      message: '名字不能重复',
      trigger: 'input',
    },
  ],
  model: [emptyCheck('模型')],
  endpoint: [
    emptyCheck('API端点'),
    {
      validator: (rule: FormItemRule, value: string) => {
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
          return false;
        }
      },
      message: 'API端点不合法',
      trigger: 'input',
    },
  ],
  key: [
    emptyCheck('Key'),
    {
      level: 'warning',
      validator: (rule: FormItemRule, value: string) =>
        workspaceRef.value.workers
          .filter((w) => w.id !== props.worker?.id)
          .find((w) => w.key === value) === undefined,
      message: '有重复的Key，请确保使用的API支持并发',
      trigger: 'input',
    },
  ],
  concurrency: [
    {
      validator: (rule: FormItemRule, value: number) =>
        Number.isInteger(value) && value >= 1 && value <= 100,
      message: '并发数需为 1~100 的整数',
      trigger: 'input',
    },
  ],
};

const doValidate = () =>
  new Promise<boolean>((resolve) => {
    formRef.value?.validate((errors) => resolve(!errors));
  });

const addFormValue = computed(() => ({
  endpoint: formValue.value.endpoint,
  models: modelText.value,
  keys: keyText.value,
}));

const addFormRules: FormRules = {
  endpoint: [
    {
      validator: (_r: FormItemRule, value: string) => value.trim().length > 0,
      message: 'API端点不能为空',
      trigger: 'input',
    },
    {
      validator: (_r: FormItemRule, value: string) => {
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      message: 'API端点不合法',
      trigger: 'input',
    },
  ],
  models: [
    {
      validator: (_r: FormItemRule, value: string) => {
        const items = value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        return items.length > 0;
      },
      message: '请至少输入一个模型',
    },
    {
      validator: (_r: FormItemRule, value: string) => {
        const items = value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        return new Set(items).size === items.length;
      },
      message: '存在重复的模型名',
    },
  ],
  keys: [
    {
      validator: (_r: FormItemRule, value: string) => {
        const items = value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        return items.length > 0;
      },
      message: '请至少输入一个Key',
    },
    {
      validator: (_r: FormItemRule, value: string) => {
        const items = value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        return new Set(items).size === items.length;
      },
      message: '存在重复的Key',
    },
  ],
};

const modelText = ref('');
const keyText = ref('');
const defaultConcurrency = ref(1);
const keyIds = new Map<string, number>();
const workerNames = reactive<Record<string, string>>({});
const workerConcurrencies = reactive<Record<string, number>>({});

watch(
  () => props.show,
  (show) => {
    if (show && props.worker === undefined) {
      keyIds.clear();
      modelText.value = '';
      keyText.value = '';
      for (const uid of Object.keys(workerNames)) delete workerNames[uid];
      for (const uid of Object.keys(workerConcurrencies))
        delete workerConcurrencies[uid];
      defaultConcurrency.value = 1;
      formValue.value = initFormValue(undefined);
      preserveEndpoint.value = false;
    }
  },
);

const models = computed(() => [
  ...new Set(
    modelText.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
]);

const keys = computed(() =>
  keyText.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
);

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

watch([modelText, keyText], () => {
  nextTick(() => formRef.value?.validate());
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

const addWorkers = () => {
  const endpoint = formValue.value.endpoint.trim();
  const profile = {
    id: formValue.value.profileId,
    values: { ...formValue.value.profileValues },
  };
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

const submit = async () => {
  if (props.worker === undefined) {
    if (!(await doValidate())) return;
    const idError = validateIds();
    if (idError) {
      Toast.warning(idError);
      return;
    }
    addWorkers();
    Toast.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
    emit('update:show', false);
  } else {
    if (!(await doValidate())) return;
    const { id, model, endpoint, key, concurrency, profileId, profileValues } =
      formValue.value;
    const worker = {
      id: id.trim(),
      model: model.trim(),
      endpoint: endpoint.trim(),
      key: key.trim(),
      concurrency,
      profile: {
        id: profileId,
        values: { ...profileValues },
      },
    };
    const index = workspaceRef.value.workers.findIndex(
      (w) => w.id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    Toast.success(`已更新翻译器「${worker.id}」`);
    emit('update:show', false);
  }
};

const submitAndContinue = async () => {
  if (!(await doValidate())) return;
  const idError = validateIds();
  if (idError) {
    Toast.warning(idError);
    return;
  }
  addWorkers();
  Toast.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <XDialog
    :open="show"
    @update:open="$emit('update:show', $event)"
    :title="verb + '翻译器'"
    style="width: min(750px, calc(100% - 16px))"
  >
    <n-form
      ref="form"
      :model="props.worker === undefined ? addFormValue : formValue"
      :rules="props.worker === undefined ? addFormRules : editFormRules"
      label-placement="left"
      label-width="auto"
    >
      <n-form-item-row label="接口格式">
        <XSelect
          :model-value="formValue.profileId"
          :options="
            openAiProfiles.map((p) => ({ label: p.label, value: p.id }))
          "
          aria-label="接口格式"
          class="w-full"
          @update:model-value="onProfileChange"
        />
      </n-form-item-row>

      <template v-if="currentProfile?.fields.length">
        <n-form-item-row
          v-for="field in currentProfile.fields"
          :key="`${formValue.profileId}-${field.key}`"
          :label="field.label"
        >
          <XSelect
            v-if="field.type === 'select'"
            :model-value="
              String(
                field.options.findIndex(
                  (option) =>
                    option.value === formValue.profileValues[field.key],
                ),
              )
            "
            :options="
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
        </n-form-item-row>
      </template>
      <!-- 添加模式：批量 -->
      <template v-if="props.worker === undefined">
        <n-form-item-row path="endpoint" label="API端点">
          <n-input
            :value="formValue.endpoint"
            :placeholder="defaultEndpoint(formValue.profileId)"
            @update:value="onEndpointInput"
          />
        </n-form-item-row>

        <n-form-item-row path="models" label="模型">
          <n-input
            v-model:value="modelText"
            type="textarea"
            placeholder="每行一个模型名&#10;deepseek-v4-pro&#10;deepseek-v4-flash"
            :autosize="{ minRows: 2, maxRows: 5 }"
          />
        </n-form-item-row>

        <n-form-item-row path="keys" label="Key">
          <n-input
            v-model:value="keyText"
            type="textarea"
            placeholder="每行一个Key&#10;sk-xxxxxxxx&#10;sk-yyyyyyyy"
            :autosize="{ minRows: 2, maxRows: 5 }"
          />
        </n-form-item-row>

        <n-form-item-row label="默认并发">
          <n-input-number
            v-model:value="defaultConcurrency"
            :min="1"
            :max="100"
          />
        </n-form-item-row>

        <n-form-item-row v-if="generatedWorkers.length > 0" label="预览">
          <n-table :single-line="false" size="small">
            <thead>
              <tr>
                <th>显示名称</th>
                <th>模型</th>
                <th>Key</th>
                <th style="width: 80px">并发</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in generatedWorkers" :key="w.uid">
                <td>
                  <n-input
                    :value="workerNames[w.uid] ?? w.id"
                    :placeholder="w.id"
                    size="small"
                    aria-label="翻译器显示名称"
                    @update:value="workerNames[w.uid] = $event"
                  />
                </td>
                <td>{{ w.model }}</td>
                <td style="font-family: monospace; font-size: 12px">
                  {{ maskKey(w.key) }}
                </td>
                <td>
                  <input
                    type="number"
                    class="concurrency-input"
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
        </n-form-item-row>
      </template>

      <!-- 编辑模式：单个 -->
      <template v-else>
        <n-form-item-row path="id" label="名字">
          <n-input
            v-model:value="formValue.id"
            placeholder="给你的翻译器起个名字"
          />
        </n-form-item-row>
        <n-form-item-row path="model" label="模型">
          <n-input
            v-model:value="formValue.model"
            placeholder="deepseek-v4-pro"
          />
        </n-form-item-row>
        <n-form-item-row path="endpoint" label="API端点">
          <n-input
            :value="formValue.endpoint"
            :placeholder="defaultEndpoint(formValue.profileId)"
            @update:value="onEndpointInput"
          />
        </n-form-item-row>
        <n-form-item-row path="key" label="Key">
          <n-input v-model:value="formValue.key" placeholder="API Key" />
        </n-form-item-row>
        <n-form-item-row path="concurrency" label="并发数">
          <n-input-number
            v-model:value="formValue.concurrency"
            :min="1"
            :max="100"
          />
        </n-form-item-row>
      </template>
    </n-form>

    <template #footer>
      <n-flex v-if="props.worker === undefined" :size="12">
        <c-button label="添加并继续" @action="submitAndContinue" />
        <c-button label="添加" type="primary" @action="submit" />
      </n-flex>
      <c-button v-else label="更新" type="primary" @action="submit" />
    </template>
  </XDialog>
</template>

<style scoped>
.concurrency-input {
  width: 60px;
  padding: 2px 4px;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  /* background: var(--n-color-embedded); */
  outline: none;
  transition: border-color 0.2s;
}
.concurrency-input:focus {
  border-color: var(--n-color-target);
}
.concurrency-input::-webkit-inner-spin-button,
.concurrency-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
