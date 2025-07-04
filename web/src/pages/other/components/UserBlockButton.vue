<script lang="ts" setup>
import { Locator } from '@/data';
import { copyToClipBoard } from '@/pages/util';
import { DeleteOutlineOutlined } from '@vicons/material';

const blockUserCommentRepository = Locator.blockUserCommentRepository();

const message = useMessage();

const blockedUsers = ref(blockUserCommentRepository.ref.value.usernames);

const userToAdd = ref('');

const importListRaw = ref('');

const showModal = ref(false);

const toggleModal = () => {
  showModal.value = !showModal.value;
};

const addUser = () => {
  if (blockedUsers.value.includes(userToAdd.value.trim())) {
    return;
  }
  blockedUsers.value = [userToAdd.value.trim(), ...blockedUsers.value];
  userToAdd.value = '';
};

const deleteUser = (username: string) => {
  blockedUsers.value = blockedUsers.value.filter((user) => user !== username);
};

const submitTable = () => {
  blockUserCommentRepository.ref.value = {
    usernames: [...blockedUsers.value],
  };
  showModal.value = false;
  message.success('黑名单更新成功');
};

const exportUserBlockList = async (ev: MouseEvent) => {
  const isSuccess = await copyToClipBoard(
    JSON.stringify(blockedUsers.value, null, 0),
    ev.target as HTMLElement,
  );
  if (isSuccess) {
    message.success('导出成功：已复制到剪贴板');
  } else {
    message.success('导出失败');
  }
};

const importUserBlockList = () => {
  const fromJson = (json: string): string[] | undefined => {
    const obj = JSON.parse(json);
    if (!Array.isArray(obj)) {
      return;
    }
    const lists: string[] = [];
    for (const item of obj) {
      if (typeof item !== 'string') {
        return;
      }
      lists.push(item.trim());
    }
    return lists;
  };
  const imported = fromJson(importListRaw.value);
  if (imported === undefined) {
    return;
  }
  for (const user of imported) {
    if (!blockedUsers.value.includes(user)) {
      blockedUsers.value.push(user);
    }
  }
  blockUserCommentRepository.ref.value = {
    usernames: [...blockedUsers.value],
  };
  importListRaw.value = '';
};
</script>

<template>
  <c-button label="管理黑名单" size="small" @action="toggleModal" />
  <c-modal title="管理黑名单" v-model:show="showModal" :extraheight="120">
    <template #header-extra>
      <n-flex
        vertical
        size="large"
        style="max-width: 400px; margin-bottom: 16px"
      >
        <n-input-group>
          <n-input
            v-model:value="userToAdd"
            size="small"
            placeholder="用户名"
            :input-props="{ spellcheck: false }"
          />
          <c-button
            label="添加"
            :round="false"
            size="small"
            @action="addUser"
          />
        </n-input-group>
        <n-input
          v-model:value="importListRaw"
          type="textarea"
          size="small"
          placeholder="批量导入"
          :input-props="{ spellcheck: false }"
          :rows="1"
        />

        <n-flex align="center" :wrap="false">
          <c-button
            label="导出"
            :round="false"
            size="small"
            @action="exportUserBlockList"
          />
          <c-button
            label="导入"
            :round="false"
            size="small"
            @action="importUserBlockList"
          />
        </n-flex>
      </n-flex>
    </template>
    <n-table
      v-if="blockedUsers.length !== 0"
      striped
      size="small"
      style="font-size: 12px; max-width: 400px"
    >
      <tr v-for="user in blockedUsers" :key="user">
        <td>{{ user }}</td>
        <td>
          <c-button
            :icon="DeleteOutlineOutlined"
            text
            type="error"
            size="small"
            @action="deleteUser(user)"
          />
        </td>
      </tr>
    </n-table>
    <template #action>
      <c-button label="提交" type="primary" @action="submitTable()" />
    </template>
  </c-modal>
</template>
