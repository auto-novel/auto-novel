<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

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
      model: 'deepseek-chat',
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

const formRules: FormRules = {
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

const submit = async () => {
  const validated = await new Promise<boolean>((resolve) => {
    formRef.value?.validate((errors) => {
      if (errors) resolve(false);
      else resolve(true);
    });
  });
  if (!validated) return;

  const { id, model, endpoint, key, concurrency } = formValue.value;
  const worker = {
    id: id.trim(),
    model: model.trim(),
    endpoint: endpoint.trim(),
    key: key.trim(),
    concurrency,
  };

  if (props.worker === undefined) {
    workspace.addWorker(worker);
  } else {
    const index = workspaceRef.value.workers.findIndex(
      (w) => w.id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    emit('update:show', false);
  }
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <c-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :title="verb + '翻译器'"
  >
    <n-form
      ref="form"
      :model="formValue"
      :rules="formRules"
      label-placement="left"
      label-width="auto"
    >
      <n-form-item-row path="id" label="名字">
        <n-input
          v-model:value="formValue.id"
          placeholder="给你的翻译器起个名字"
        />
      </n-form-item-row>
      <n-form-item-row path="model" label="模型">
        <n-input v-model:value="formValue.model" placeholder="deepseek-chat" />
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
    </n-form>
    <template #action>
      <c-button :label="verb" type="primary" @action="submit" />
    </template>
  </c-modal>
</template>
