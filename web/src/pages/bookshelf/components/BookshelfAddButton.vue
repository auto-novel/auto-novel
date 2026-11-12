<script lang="ts" setup>
import { useRequireLogin } from '@/util/useRequireLogin';
import { PlusOutlined } from '@vicons/material';
import type { Form, FormError, FormSchema } from '@nuxt/ui';
import { getApiErrorMessage, Toast } from '@novelia/web-kit';

import { FavoredRepo } from '@/stores';

const showAddModal = ref(false);

const formRef = useTemplateRef<Form<FormSchema>>('form');

const formValue = ref<{
  title: string;
  type: 'web' | 'wenku' | 'local';
}>({
  title: '',
  type: 'web',
});
const validate = (): FormError[] => {
  const errors: FormError[] = [];
  const { title } = formValue.value;
  if (title.length === 0) {
    errors.push({ name: 'title', message: '收藏夹标题不能为空' });
  }
  if (title.length > 20) {
    errors.push({ name: 'title', message: '收藏夹标题至多为20个字符' });
  }
  return errors;
};

const addFavorite = async () => {
  if (!(await formRef.value?.validate({ silent: true }))) return;

  const { type, title } = formValue.value;
  await Toast.promise(FavoredRepo.createFavored(type, title), {
    success: '收藏夹创建成功',
    error: (reason) => getApiErrorMessage(reason, '收藏夹创建失败'),
  })
    .then(() => {
      showAddModal.value = false;
    })
    .catch(() => {});
};
const requireLogin = useRequireLogin();
</script>

<template>
  <UButton
    :icon="PlusOutlined"
    color="neutral"
    variant="outline"
    class="rounded-full"
    @click="showAddModal = true"
  >
    新建
  </UButton>

  <UModal
    title="新建收藏夹"
    v-model:open="showAddModal"
    class="w-150"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]' }"
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
          name="title"
          label="标题"
          orientation="horizontal"
          eager-validation
          :ui="{ container: 'flex-1' }"
        >
          <UInput
            class="w-full"
            v-model="formValue.title"
            placeholder="收藏夹标题"
            :spellcheck="false"
          />
        </UFormField>

        <UFormField
          name="type"
          label="类型"
          orientation="horizontal"
          :ui="{ container: 'flex-1' }"
        >
          <URadioGroup
            v-model="formValue.type"
            orientation="horizontal"
            variant="table"
            indicator="hidden"
            :items="[
              { label: '网页小说', value: 'web' },
              { label: '文库小说', value: 'wenku' },
              { label: '本地小说', value: 'local' },
            ]"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <ActionButton
        color="primary"
        :action="requireLogin(addFavorite)"
        variant="solid"
      >
        确定
      </ActionButton>
    </template>
  </UModal>
</template>
