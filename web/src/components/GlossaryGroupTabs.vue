<script lang="ts" setup>
import { AddOutlined } from '@vicons/material';

const props = defineProps<{
  groupNames: string[];
  displayData: Record<string, { jp: string; zh: string }[]>;
  selectedGroup: string | undefined;
  editingGroupName: string | null;
  editingGroupNewName: string;
  showNewGroupInput: boolean;
  newGroupName: string;
  ungroupedCount: number;
}>();

const emit = defineEmits<{
  select: [name: string | undefined];
  startRename: [name: string];
  finishRename: [];
  'update:editingGroupNewName': [value: string];
  addNewGroup: [];
  'update:newGroupName': [value: string];
  showNewGroup: [];
  deleteGroup: [];
}>();
</script>

<template>
  <!-- 用户分组列表 -->
  <div
    v-for="name in groupNames"
    :key="name"
    @click="emit('select', name)"
    :style="{
      padding: '4px 8px',
      cursor: 'pointer',
      borderRadius: '4px',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      background:
        selectedGroup === name
          ? 'var(--primary-color-hover, #eee)'
          : 'transparent',
    }"
  >
    <template v-if="editingGroupName === name">
      <n-input
        :value="editingGroupNewName"
        size="tiny"
        @update:value="emit('update:editingGroupNewName', $event)"
        @blur="emit('finishRename')"
        @keydown.enter="emit('finishRename')"
      />
    </template>
    <template v-else>
      <n-flex justify="space-between" align="center">
        <n-text @dblclick="emit('startRename', name)" style="flex: 1">
          {{ name }}
        </n-text>
        <n-text depth="3" style="font-size: 10px">
          {{ displayData[name]?.length ?? 0 }}
        </n-text>
      </n-flex>
    </template>
  </div>

  <!-- 未分组 -->
  <div
    @click="emit('select', undefined)"
    :style="{
      padding: '4px 8px',
      cursor: 'pointer',
      borderRadius: '4px',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      background:
        selectedGroup === undefined
          ? 'var(--primary-color-hover, #eee)'
          : 'transparent',
    }"
  >
    <n-flex justify="space-between" align="center">
      <n-text>未分组</n-text>
      <n-text depth="3" style="font-size: 10px">{{ ungroupedCount }}</n-text>
    </n-flex>
  </div>

  <!-- 新建组 -->
  <div v-if="showNewGroupInput" style="margin-top: 4px">
    <n-input
      :value="newGroupName"
      size="tiny"
      placeholder="新分组名"
      @update:value="emit('update:newGroupName', $event)"
      @keydown.enter="emit('addNewGroup')"
      @blur="emit('addNewGroup')"
    />
  </div>
  <c-button
    v-else
    :icon="AddOutlined"
    label="新建组"
    size="tiny"
    text
    @action="emit('showNewGroup')"
  />

  <!-- 删除当前组 -->
  <c-button
    v-if="selectedGroup && selectedGroup !== '未分组'"
    label="删除此组"
    size="tiny"
    text
    type="error"
    @action="emit('deleteGroup')"
  />
</template>
