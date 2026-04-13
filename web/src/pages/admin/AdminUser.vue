<script lang="ts" setup>
import { AdminRepo } from '@/repos';
import { UserRole } from '@/model/User';
import type { UserListValue } from './option';
import { getUserListOptions } from './option';
import { onUpdateListValue, onUpdatePage } from './option';

const props = defineProps<{
  page: number;
  query: string;
  selected: number[];
}>();

const listOptions = getUserListOptions();

const listValue = computed(
  () =>
    <UserListValue>{
      搜索: props.query,
      角色: props.selected[0] ?? 0,
    },
);

function numberToRole(num: number): UserRole | undefined {
  const roles = [
    undefined,
    'member',
    'admin',
    'trusted',
    'restricted',
    'banned',
  ] as const;
  return roles[num];
}

const pageSize = 100;
const { data: userPage, error } = AdminRepo.useUserList(
  pageSize,
  () => props.page,
  () => ({
    q: listValue.value.搜索,
    role: numberToRole(listValue.value.角色),
  }),
);
</script>

<template>
  <ListFilter
    :options="listOptions"
    :value="listValue"
    @update:value="onUpdateListValue(listOptions, $event)"
  />

  <CPage
    :page="page"
    :page-size="pageSize"
    :total="userPage?.total ?? 0"
    @update:page="onUpdatePage"
  >
    <template v-if="userPage">
      <n-divider />
      <n-list>
        <n-list-item v-for="user in userPage.items" :key="user.name">
          <n-flex vertical>
            <n-flex>
              <n-text>
                <b>{{ user.name }}</b>
              </n-text>

              <n-text>{{ UserRole.toString(user.role) }}</n-text>
              <n-text>{{ user.email }}</n-text>
            </n-flex>

            <n-text depth="3" style="font-size: 12px">
              创建于
              <n-time :time="user.createdAt" type="relative" />
              ，上次登录
              <n-time :time="user.lastLogin" type="relative" />
            </n-text>
          </n-flex>
        </n-list-item>
      </n-list>
      <n-empty v-if="userPage.items.length === 0" description="空列表" />
      <n-divider />
    </template>

    <CResultX v-else :error="error" title="加载错误" />
  </CPage>
</template>
