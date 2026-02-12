<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

import type { GptWorker } from '@/model/Translator';
import { useGptWorkspaceStore } from '@/stores';

const props = defineProps<{
  show: boolean;
  worker?: GptWorker;
}>();
const emit = defineEmits<{
  'update:show': [boolean];
}>();

const workspace = useGptWorkspaceStore();
const workspaceRef = workspace.ref;

const initFormValue = (): {
  id: string;
  model: string;
  endpoint: string;
  key: string;
  concurrency: number;
  retryCount: number;
} => {
  const worker = props.worker;
  if (worker === undefined) {
    return {
      id: '',
      model: 'deepseek-chat',
      endpoint: 'https://api.deepseek.com',
      key: '',
      concurrency: 1,
      retryCount: 3,
    };
  } else {
    return {
      id: worker.id,
      model: worker.model,
      endpoint: worker.endpoint,
      key: worker.key,
      concurrency: worker.concurrency ?? 1,
      retryCount: worker.retryCount ?? 3,
    };
  }
};

const formRef = useTemplateRef<FormInst>('form');
const formValue = ref(initFormValue());

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
          .filter(({ id }) => id !== props.worker?.id)
          .find(({ id }) => id === value) === undefined,
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
          .filter(({ id }) => id !== props.worker?.id)
          .find(({ key }) => key === value) === undefined,
      message: '有重复的Key，请确保使用的API支持并发',
      trigger: 'input',
    },
  ],
};

const submit = async () => {
  const validated = await new Promise<boolean>(function (resolve, _reject) {
    formRef.value?.validate((errors) => {
      if (errors) resolve(false);
      else resolve(true);
    });
  });
  if (!validated) return;

  const { id, model, endpoint, key, concurrency, retryCount } = formValue.value;
  const worker = {
    id: id.trim(),
    type: 'api' as const,
    model: model.trim(),
    endpoint: endpoint.trim(),
    key: key.trim(),
    concurrency,
    retryCount,
  };

  if (props.worker === undefined) {
    workspace.addWorker(worker);
  } else {
    const index = workspaceRef.value.workers.findIndex(
      ({ id }) => id === props.worker?.id,
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
    :title="verb + 'GPT翻译器'"
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
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="model" label="模型">
        <n-input
          v-model:value="formValue.model"
          placeholder="模型名称"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>
      <n-form-item-row path="endpoint" label="链接">
        <n-input
          v-model:value="formValue.endpoint"
          placeholder="兼容OpenAI的API链接，默认使用deepseek"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="key" label="Key">
        <n-input
          v-model:value="formValue.key"
          placeholder="请输入Api key"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="concurrency" label="并发数">
        <n-input-number
          v-model:value="formValue.concurrency"
          :show-button="false"
          :min="1"
        />
      </n-form-item-row>

      <n-form-item-row path="retryCount" label="重试次数">
        <n-input-number
          v-model:value="formValue.retryCount"
          :show-button="false"
          :min="1"
        />
      </n-form-item-row>

      <n-text depth="3" style="font-size: 12px">
        # 链接例子：https://api.deepseek.com
      </n-text>
    </n-form>

    <template #action>
      <c-button :label="verb" type="primary" @action="submit" />
    </template>
  </c-modal>
</template>
