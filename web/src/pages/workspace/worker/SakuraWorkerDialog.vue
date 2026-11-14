<script lang="ts" setup>
import { Toast } from '@novelia/web-kit';
import type { Form, FormError, FormSchema } from '@nuxt/ui';

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
const initFormValue = () => ({
  id: props.worker?.id ?? '',
  endpoint: props.worker?.endpoint ?? '',
  concurrency: props.worker?.concurrency ?? 1,
});

const formRef = useTemplateRef<Form<FormSchema>>('form');

const formValue = ref(initFormValue());
watch(
  () => props.show,
  (show) => {
    if (show) formValue.value = initFormValue();
  },
);
const validate = (): FormError[] => {
  const errors: FormError[] = [];
  const { id, endpoint } = formValue.value;
  if (id.trim().length === 0) {
    errors.push({ name: 'id', message: '名字不能为空' });
  }
  if (
    workspaceRef.value.workers.some(
      (worker) => worker.id !== props.worker?.id && worker.id === id,
    )
  ) {
    errors.push({ name: 'id', message: '名字不能重复' });
  }
  if (endpoint.trim().length === 0) {
    errors.push({ name: 'endpoint', message: 'API端点不能为空' });
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push({ name: 'endpoint', message: 'API端点不合法' });
    }
  } catch {
    errors.push({ name: 'endpoint', message: 'API端点不合法' });
  }
  return errors;
};

const buildWorker = () => {
  const worker = { ...formValue.value };
  worker.id = worker.id.trim();
  worker.endpoint = worker.endpoint.trim();
  return worker;
};

const submit = async () => {
  if (!(await formRef.value?.validate({ silent: true }))) return;
  const worker = buildWorker();

  if (props.worker === undefined) {
    workspace.addWorker(worker);
    Toast.success(`已添加翻译器「${worker.id}」`);
    emit('update:show', false);
  } else {
    const index = workspaceRef.value.workers.findIndex(
      ({ id }) => id === props.worker?.id,
    );
    workspaceRef.value.workers[index] = worker;
    Toast.success(`已更新翻译器「${worker.id}」`);
    emit('update:show', false);
  }
};

const submitAndContinue = async () => {
  if (!(await formRef.value?.validate({ silent: true }))) return;
  const worker = buildWorker();
  workspace.addWorker(worker);
  Toast.success(`已添加翻译器「${worker.id}」`);
};

const verb = computed(() => (props.worker === undefined ? '添加' : '更新'));
</script>

<template>
  <UModal
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
    :open="show"
    @update:open="$emit('update:show', $event)"
    :title="verb + 'Sakura翻译器'"
    class="w-150"
  >
    <template #body>
      <UForm
        ref="form"
        :state="formValue"
        :validate="validate"
        :validate-on="['input']"
        :validate-on-input-delay="0"
        class="space-y-6"
      >
        <UFormField
          name="id"
          label="名字"
          orientation="horizontal"
          eager-validation
          :ui="{ wrapper: 'w-15 shrink-0', container: 'min-w-0 flex-1' }"
        >
          <UInput
            class="w-full"
            v-model="formValue.id"
            placeholder="给你的翻译器起个名字"
            :spellcheck="false"
          />
        </UFormField>
        <UFormField
          name="endpoint"
          label="API端点"
          orientation="horizontal"
          eager-validation
          :ui="{ wrapper: 'w-15 shrink-0', container: 'min-w-0 flex-1' }"
        >
          <UInput
            class="w-full"
            v-model="formValue.endpoint"
            placeholder="翻译器的API端点"
            :spellcheck="false"
          />
        </UFormField>

        <UFormField
          name="concurrency"
          label="并发数"
          orientation="horizontal"
          :ui="{ wrapper: 'w-15 shrink-0', container: 'min-w-0 flex-1' }"
        >
          <UInputNumber
            class="w-full"
            :model-value="formValue.concurrency"
            :min="1"
            :max="100"
            :format-options="{ maximumFractionDigits: 0 }"
            @update:model-value="
              (value) => (formValue.concurrency = value ?? 1)
            "
          />
        </UFormField>

        <span class="text-muted text-[12px]!">
          # 分段长度与前文长度固定为500字符，不支持配置
          <br />
          # API端点例子：http://127.0.0.1:8080
        </span>
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
