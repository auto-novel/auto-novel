<script lang="ts" setup>
import { Locator } from '@/data';
import { DeleteOutlineOutlined } from '@vicons/material';

const blockUserCommentRepository = Locator.blockUserCommentRepository();

const message = useMessage();

const blockedUsers = ref(blockUserCommentRepository.ref.value.usernames);

const userToAdd = ref('');

const showModal = ref(false);

const toggleModal = () => {
  showModal.value = !showModal.value;
};

const addUser = () => {
  if (blockedUsers.value.includes(userToAdd.value.trim())) {
    return;
  }
  blockedUsers.value = [userToAdd.value.trim(), ...blockedUsers.value];
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
