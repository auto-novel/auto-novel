<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';

import type { SakuraWorker } from '@/model/Translator';
import { useSakuraWorkspaceStore } from '@/stores';

const props = defineProps<{
  show: boolean;
  worker?: SakuraWorker;
}>();
const emit = defineEmits<{
  'update:show': [boolean];
}>();

const workspace = useSakuraWorkspaceStore();
const workspaceRef = workspace.ref;
const message = useMessage();

const initFormValue = () => {
  const worker = props.worker;
  if (worker === undefined) {
    return {
      id: '',
      endpoint: '',
      segLength: 500,
      prevSegLength: 500,
    };
  } else {
    return { ...worker };
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

const doValidate = async () => {
  const validated = await new Promise<boolean>(function (resolve, _reject) {
    formRef.value?.validate((errors) => {
      if (errors) resolve(false);
      else resolve(true);
    });
  });
  return validated;
};

const buildWorker = () => {
  const worker = { ...formValue.value };
  worker.id = worker.id.trim();
  worker.endpoint = worker.endpoint.trim();
  return worker;
};

const submit = async () => {
  if (!(await doValidate())) return;
  const worker = buildWorker();

  if (props.worker === undefined) {
    workspace.addWorker(worker);
    message.success(`已添加翻译器「${worker.id}」`);
    emit('update:show', false);
  } else {
    const index = workspaceRef.value.workers.findIndex(
      ({ id }) => id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    message.success(`已更新翻译器「${worker.id}」`);
    emit('update:show', false);
  }
};

const submitAndContinue = async () => {
  if (!(await doValidate())) return;
  const worker = buildWorker();
  workspace.addWorker(worker);
  message.success(`已添加翻译器「${worker.id}」`);
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <c-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :title="verb + 'Sakura翻译器'"
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
          placeholder="翻译器的链接"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item-row>

      <n-form-item-row path="segLength" label="分段长度">
        <n-input-number
          v-model:value="formValue.segLength"
          :show-button="false"
          :min="100"
        />
      </n-form-item-row>

      <n-form-item-row path="prevSegLength" label="前文长度">
        <n-input-number
          v-model:value="formValue.prevSegLength"
          :show-button="false"
          :min="0"
        />
      </n-form-item-row>

      <n-text type="error" style="font-size: 12px">
        # 前文长度是临时功能，非默认500无法上传
      </n-text>
      <br />
      <n-text depth="3" style="font-size: 12px">
        # 分段长度还在测试中，非默认500无法上传
        <br />
        # 链接例子：http://127.0.0.1:8080
      </n-text>
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
