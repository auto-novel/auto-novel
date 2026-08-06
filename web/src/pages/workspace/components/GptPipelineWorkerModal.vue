<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';

import type { GptPipelineWorker } from '@/model/Translator';
import { useGptPipelineWorkspaceStore } from '@/stores';

const props = defineProps<{
  show: boolean;
  worker?: GptPipelineWorker;
}>();
const emit = defineEmits<{
  'update:show': [boolean];
}>();

const workspace = useGptPipelineWorkspaceStore();
const workspaceRef = workspace.ref;
const message = useMessage();

// ── 编辑模式表单（单翻译器）─────────────────────────────────

const initFormValue = (
  worker: GptPipelineWorker | undefined,
): {
  id: string;
  model: string;
  endpoint: string;
  key: string;
  concurrency: number;
} => {
  if (worker === undefined) {
    return {
      id: '',
      model: 'deepseek-v4-pro',
      endpoint: 'https://api.deepseek.com',
      key: '',
      concurrency: 1,
    };
  } else {
    return {
      id: worker.id,
      model: worker.model,
      endpoint: worker.endpoint,
      key: worker.key,
      concurrency: worker.concurrency,
    };
  }
};

const formRef = useTemplateRef<FormInst>('form');
const formValue = ref(initFormValue(props.worker));

watch(
  () => props.worker,
  (newWorker) => {
    formValue.value = initFormValue(newWorker);
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
    emptyCheck('链接'),
    {
      validator: (rule: FormItemRule, value: string) => {
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
          return false;
        }
      },
      message: '链接不合法',
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
      message: '链接不能为空',
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
      message: '链接不合法',
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
const workerConcurrencies = reactive<Record<string, number>>({});

watch(
  () => props.show,
  (show) => {
    if (show && props.worker === undefined) {
      modelText.value = '';
      keyText.value = '';
      defaultConcurrency.value = 1;
      formValue.value = initFormValue(undefined);
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
  id: string;
  model: string;
  key: string;
}

const generatedWorkers = computed<GeneratedWorker[]>(() => {
  const ms = models.value;
  const ks = keys.value;
  if (ms.length === 0 || ks.length === 0) return [];

  const result: GeneratedWorker[] = [];
  for (const model of ms) {
    for (let ki = 0; ki < ks.length; ki++) {
      const id = ks.length === 1 ? model : `${model}[${ks[ki].slice(-4)}]`;
      result.push({ id, model, key: ks[ki] });
    }
  }
  return result;
});

watch(generatedWorkers, (ws) => {
  const newIds = new Set(ws.map((w) => w.id));
  for (const key of Object.keys(workerConcurrencies)) {
    if (!newIds.has(key)) delete workerConcurrencies[key];
  }
  for (const w of ws) {
    if (!(w.id in workerConcurrencies)) {
      workerConcurrencies[w.id] = defaultConcurrency.value;
    }
  }
});

const maskKey = (key: string) => {
  if (key.length <= 12) return key;
  return key.slice(0, 8) + '…' + key.slice(-4);
};

watch(defaultConcurrency, (val) => {
  for (const w of generatedWorkers.value) {
    workerConcurrencies[w.id] = val;
  }
});

watch([modelText, keyText], () => {
  nextTick(() => formRef.value?.validate());
});

const validateIds = (): string | null => {
  const existingIds = new Set(workspaceRef.value.workers.map((w) => w.id));
  for (const w of generatedWorkers.value) {
    if (existingIds.has(w.id)) return `翻译器「${w.id}」已存在`;
  }
  return null;
};

const addWorkers = () => {
  const endpoint = formValue.value.endpoint.trim();
  for (const w of generatedWorkers.value) {
    workspace.addWorker({
      id: w.id,
      model: w.model,
      endpoint,
      key: w.key,
      concurrency: workerConcurrencies[w.id] ?? defaultConcurrency.value,
    });
  }
};

const submit = async () => {
  if (props.worker === undefined) {
    if (!(await doValidate())) return;
    const idError = validateIds();
    if (idError) {
      message.warning(idError);
      return;
    }
    addWorkers();
    message.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
    emit('update:show', false);
  } else {
    if (!(await doValidate())) return;
    const { id, model, endpoint, key, concurrency } = formValue.value;
    const worker = {
      id: id.trim(),
      model: model.trim(),
      endpoint: endpoint.trim(),
      key: key.trim(),
      concurrency,
    };
    const index = workspaceRef.value.workers.findIndex(
      (w) => w.id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    message.success(`已更新翻译器「${worker.id}」`);
    emit('update:show', false);
  }
};

const submitAndContinue = async () => {
  if (!(await doValidate())) return;
  const idError = validateIds();
  if (idError) {
    message.warning(idError);
    return;
  }
  addWorkers();
  message.success(`已添加 ${generatedWorkers.value.length} 个翻译器`);
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <c-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
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
      <!-- 添加模式：批量 -->
      <template v-if="props.worker === undefined">
        <n-form-item-row path="endpoint" label="链接">
          <n-input
            v-model:value="formValue.endpoint"
            placeholder="https://api.deepseek.com"
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
                <th>名字</th>
                <th>模型</th>
                <th>Key</th>
                <th style="width: 80px">并发</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in generatedWorkers" :key="w.id">
                <td>{{ w.id }}</td>
                <td>{{ w.model }}</td>
                <td style="font-family: monospace; font-size: 12px">
                  {{ maskKey(w.key) }}
                </td>
                <td>
                  <input
                    type="number"
                    class="concurrency-input"
                    :value="workerConcurrencies[w.id]"
                    min="1"
                    max="100"
                    @input="
                      workerConcurrencies[w.id] = Number(
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
        <n-form-item-row path="endpoint" label="链接">
          <n-input
            v-model:value="formValue.endpoint"
            placeholder="https://api.deepseek.com"
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

    <template #action>
      <n-flex v-if="props.worker === undefined" :size="12">
        <c-button label="添加并继续" @action="submitAndContinue" />
        <c-button label="添加" type="primary" @action="submit" />
      </n-flex>
      <c-button v-else label="更新" type="primary" @action="submit" />
    </template>
  </c-modal>
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
