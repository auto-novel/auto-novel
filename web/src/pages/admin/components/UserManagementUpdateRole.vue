<script lang="ts" setup>
import { UserRepository } from '@/data/api';
import { UserRole } from '@/model/User';
import { doAction } from '@/pages/util';

const props = defineProps<{
  id: string;
  username: string;
  role: UserRole;
}>();

const emit = defineEmits<{
  update: [];
}>();

const userRole = ref<UserRole>(props.role);

const showActionModal = ref(false);

const message = useMessage();

const userRoleOptions = [
  { value: 'member', label: '普通用户' },
  { value: 'admin', label: '管理员' },
  { value: 'trusted', label: '信任用户' },
  { value: 'restricted', label: '受限用户' },
  { value: 'banned', label: '封禁用户' },
];

const submitRole = () => {
  doAction(
    UserRepository.updateRole(props.id, { role: userRole.value }),
    `更新 ${props.username} 权限`,
    message,
  );
  showActionModal.value = false;
  emit('update');
};

const toggleActionModal = () => {
  showActionModal.value = !showActionModal.value;
};
</script>

<template>
  <c-button :label="`更新权限`" v-bind="$attrs" @action="toggleActionModal()" />

  <c-modal
    :title="`更新 ${username} 权限`"
    v-model:show="showActionModal"
    :extra-height="120"
  >
    <n-flex vertical size="large" style="max-width: 400px; margin-bottom: 32px">
      <c-radio-group
        v-model:value="userRole"
        :options="userRoleOptions"
        size="large"
      />
    </n-flex>
    <template #action>
      <c-button label="提交" type="primary" @action="submitRole()" />
    </template>
  </c-modal>
</template>
