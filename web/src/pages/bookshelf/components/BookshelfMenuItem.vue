<script lang="ts" setup>
import { MoreVertOutlined } from '@vicons/material';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';

import { doAction } from '@/pages/util';
import { FavoredRepo } from '@/stores';
import { useBookshelfLocalStore } from '../BookshelfLocalStore';

const { id, type, title } = defineProps<{
  id: string;
  title: string;
  type: 'web' | 'wenku' | 'local';
}>();

const store = useBookshelfLocalStore();

const message = useMessage();

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

  await doAction(
    FavoredRepo.updateFavored(type, id, title).then(() => {
      showEditModal.value = false;
    }),
    '收藏夹更新',
    message,
  );
};

const deleteFavoredNovels = async () => {
  if (type === 'local') {
    const { failed } = await store.deleteVolumes(
      store.volumes.filter((it) => it.favoredId === id).map(({ id }) => id),
    );
    if (failed > 0) {
      throw new Error(`清空收藏夹失败，${failed}本未删除`);
    }
  }
};

const showDeleteModal = ref(false);
const deleteFavored = () =>
  doAction(
    deleteFavoredNovels()
      .then(() => FavoredRepo.deleteFavored(type, id))
      .then(() => (showDeleteModal.value = false)),
    '收藏夹删除',
    message,
  );
</script>

<template>
  <RouterLink :to="`/favorite/${type}/${id}`">
    <n-flex align="center" justify="space-between">
      {{ title }}
      <n-dropdown
        v-if="options.length > 0"
        trigger="hover"
        :options="options"
        :keyboard="false"
        @select="onSelect"
      >
        <n-button quaternary circle>
          <n-icon :component="MoreVertOutlined" />
        </n-button>
      </n-dropdown>
    </n-flex>
  </RouterLink>

  <c-modal v-model:show="showEditModal" title="编辑收藏夹">
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

    <template #action>
      <c-button
        label="确定"
        require-login
        type="primary"
        @action="updateFavored"
      />
    </template>
  </c-modal>

  <c-modal v-model:show="showDeleteModal" title="删除收藏夹">
    确定删除收藏夹[{{ title }}]吗？
    <n-text v-if="type === 'local'">
      <br />
      注意，删除本地收藏夹的同时也会清空收藏夹内所有小说。
    </n-text>

    <template #action>
      <c-button
        label="确定"
        require-login
        type="primary"
        @action="deleteFavored"
      />
    </template>
  </c-modal>
</template>
