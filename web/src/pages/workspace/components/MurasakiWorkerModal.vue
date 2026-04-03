<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

import type { MurasakiWorker } from '@/model/Translator';
import { useMurasakiWorkspaceStore } from '@/stores';

const props = defineProps<{
  show: boolean;
  worker?: MurasakiWorker;
}>();
const emit = defineEmits<{
  'update:show': [boolean];
}>();

const workspace = useMurasakiWorkspaceStore();
const workspaceRef = workspace.ref;

const initFormValue = () => {
  const worker = props.worker;
  if (worker === undefined) {
    return {
      id: '',
      endpoint: '',
      segLength: 1000,
      prevSegLength: 0,
    };
  } else {
    return {
      id: worker.id,
      endpoint: worker.endpoint,
      segLength: worker.segLength ?? 1000,
      prevSegLength: worker.prevSegLength ?? 0,
    };
  }
};

const formRef = useTemplateRef<FormInst>('form');
const formValue = ref(initFormValue());
const formRules: FormRules = {
  id: [
    {
      validator: (rule: FormItemRule, value: string) => value.trim().length > 0,
      message: '名字不能为空',
      trigger: 'input',
    },
    {
      validator: (rule: FormItemRule, value: string) =>
        workspaceRef.value.workers
          .filter(({ id }) => id !== props.worker?.id)
          .find(({ id }) => id === value) === undefined,
      message: '名字不能重复',
      trigger: 'input',
    },
  ],
  endpoint: [
    {
      validator: (rule: FormItemRule, value: string) => value.trim().length > 0,
      message: '链接不能为空',
      trigger: 'input',
    },
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
};

const submit = async () => {
  const validated = await new Promise<boolean>(function (resolve, _reject) {
    formRef.value?.validate((errors) => {
      if (errors) resolve(false);
      else resolve(true);
    });
  });

  if (!validated) return;
  const worker = { ...formValue.value };
  worker.id = worker.id.trim();
  worker.endpoint = worker.endpoint.trim();
  worker.segLength = 1000;
  worker.prevSegLength = 0;

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
    :title="verb + 'Murasaki翻译器'"
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
      <n-form-item-row path="endpoint" label="链接">
        <n-input
          v-model:value="formValue.endpoint"
          placeholder="Murasaki 本地推理服务链接"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-text depth="3" style="font-size: 12px">
        # Murasaki 上传链路使用站点预设参数，默认分段 1000、前文 0
        <br />
        # 链接例子：http://127.0.0.1:8080
      </n-text>
    </n-form>

    <template #action>
      <c-button :label="verb" type="primary" @action="submit" />
    </template>
  </c-modal>
</template>
