<script lang="ts" setup>
import { useRequireLogin } from '@/util/useRequireLogin';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';
import { getApiErrorMessage, Toast } from '@novelia/web-kit';
import { MoreVertOutlined } from '@vicons/material';

import { FavoredRepo } from '@/stores';
import { useBookshelfLocalStore } from '../BookshelfLocalStore';

const { id, type, title } = defineProps<{
  id: string;
  title: string;
  type: 'web' | 'wenku' | 'local';
  active: boolean;
}>();

const store = useBookshelfLocalStore();

const getOptions = () => {
  if (id === 'all') {
    return [];
  } else if (id === 'default') {
    return [{ label: '编辑信息', key: 'edit' }];
  } else {
    return [
      { label: '编辑信息', key: 'edit' },
      { label: '删除', key: 'delete' },
    ];
  }
};

const options = getOptions();

const onSelect = (key: string) => {
  if (key === 'edit') {
    showEditModal.value = true;
  } else if (key === 'delete') {
    showDeleteModal.value = true;
  }
};

const showEditModal = ref(false);
const formRef = useTemplateRef<FormInst>('form');
const formValue = ref({ title });
const formRules: FormRules = {
  title: [
    {
      validator: (_rule: FormItemRule, value: string) => value.length > 0,
      message: '收藏夹标题不能为空',
      trigger: 'input',
    },
  ],
};
const updateFavored = async () => {
  if (formRef.value == null) {
    return;
  } else {
    try {
      await formRef.value.validate();
    } catch (e) {
      return;
    }
  }

  const title = formValue.value.title;

  await Toast.promise(FavoredRepo.updateFavored(type, id, title), {
    success: '收藏夹更新成功',
    error: (reason) => getApiErrorMessage(reason, '收藏夹更新失败'),
  })
    .then(() => {
      showEditModal.value = false;
    })
    .catch(() => {});
};

const deleteFavoredNovels = async () => {
  if (type === 'local') {
    await store.deleteFavoredVolumes(id);
  }
};

const showDeleteModal = ref(false);
const deleteFavored = () =>
  Toast.promise(
    deleteFavoredNovels().then(() => FavoredRepo.deleteFavored(type, id)),
    {
      success: '收藏夹删除成功',
      error: (reason) => getApiErrorMessage(reason, '收藏夹删除失败'),
    },
  )
    .then(() => {
      showDeleteModal.value = false;
    })
    .catch(() => {});
const requireLogin = useRequireLogin();
</script>

<template>
  <div
    class="flex min-w-0 items-center gap-1 rounded-sm pr-2 transition-colors hover:bg-hover"
    :class="active ? 'bg-primary-soft text-primary' : 'text-ink'"
  >
    <RouterLink
      :to="`/favorite/${type}/${id}`"
      :aria-current="active ? 'page' : undefined"
      class="min-w-0 flex-1 truncate rounded-sm px-3 py-2 text-inherit no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      {{ title }}
    </RouterLink>
    <div v-if="options.length > 0" class="shrink-0">
      <UDropdownMenu
        :ui="{ content: 'min-w-32 w-32' }"
        :items="
          options.map((option) => ({
            label: option.label,
            color: option.key === 'delete' ? ('error' as const) : undefined,
            onSelect: () => onSelect(option.key),
          }))
        "
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="更多操作"
          title="更多操作"
        >
          <MoreVertOutlined class="size-4" aria-hidden="true" />
        </UButton>
      </UDropdownMenu>
    </div>
  </div>

  <UModal
    v-model:open="showEditModal"
    title="编辑收藏夹"
    class="w-[600px]"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]', footer: 'justify-end' }"
  >
    <template #body>
      <n-form
        ref="form"
        :model="formValue"
        :rules="formRules"
        label-placement="left"
        label-width="auto"
      >
        <n-form-item-row label="标题" path="title">
          <n-input
            v-model:value="formValue.title"
            placeholder="收藏夹标题"
            :input-props="{ spellcheck: false }"
          />
        </n-form-item-row>
      </n-form>
    </template>
    <template #footer>
      <ActionButton
        color="primary"
        :action="requireLogin(updateFavored)"
        variant="solid"
      >
        确定
      </ActionButton>
    </template>
  </UModal>

  <UModal
    v-model:open="showDeleteModal"
    title="删除收藏夹"
    class="w-[600px]"
    :ui="{ content: 'max-w-[calc(100vw-2rem)]', footer: 'justify-end' }"
  >
    <template #body>
      确定删除收藏夹[{{ title }}]吗？
      <n-text v-if="type === 'local'">
        <br />
        注意，删除本地收藏夹的同时也会清空收藏夹内所有小说。
      </n-text>
    </template>
    <template #footer>
      <ActionButton
        color="primary"
        :action="requireLogin(deleteFavored)"
        variant="solid"
      >
        确定
      </ActionButton>
    </template>
  </UModal>
</template>
