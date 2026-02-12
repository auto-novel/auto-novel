<script lang="ts" setup>
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

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

const initFormValue = () => {
  const worker = props.worker;
  if (worker === undefined) {
    return {
      id: '',
      endpoint: '',
      segLength: 500,
      prevSegLength: 500,
      concurrency: 1,
      retryCount: 3,
    };
  } else {
    return {
      ...worker,
      concurrency: worker.concurrency ?? 1,
      retryCount: worker.retryCount ?? 3,
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

const isSakuraShare = computed(() => {
  try {
    const url = new URL(formValue.value.endpoint.trim());
    return url.hostname === 'sakura-share.one';
  } catch {
    return false;
  }
});

const concurrencyMax = computed(() => (isSakuraShare.value ? 6 : undefined));

watch(isSakuraShare, (isShare) => {
  if (isShare && formValue.value.concurrency > 6) {
    formValue.value.concurrency = 6;
  }
});

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

      <n-form-item-row path="concurrency" label="并发数">
        <n-input-number
          v-model:value="formValue.concurrency"
          :show-button="false"
          :min="1"
          :max="concurrencyMax"
        />
      </n-form-item-row>

      <n-form-item-row path="retryCount" label="重试次数">
        <n-input-number
          v-model:value="formValue.retryCount"
          :show-button="false"
          :min="1"
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
      <c-button :label="verb" type="primary" @action="submit" />
    </template>
  </c-modal>
</template>
