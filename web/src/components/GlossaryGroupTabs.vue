<script lang="ts" setup>
import { AddOutlined } from '@vicons/material';
import { useThemeVars } from 'naive-ui';

const themeVars = useThemeVars();
const isDark = computed(() => {
  const c = themeVars.value.bodyColor;
  if (!c) return false;
  const r = parseInt(c.substring(1, 3), 16);
  const g = parseInt(c.substring(3, 5), 16);
  const b = parseInt(c.substring(5, 7), 16);
  return (r + g + b) / 3 < 128;
});

const primaryColor = computed(() => themeVars.value.primaryColor ?? '#18a058');
const primaryColorSuppl = computed(
  () => themeVars.value.primaryColorSuppl ?? '#d0e0ff',
);
const selectBg = computed(() =>
  isDark.value ? '#263633' : primaryColorSuppl.value,
);
const selectBorder = computed(() =>
  isDark.value ? '#76e2b6' : primaryColor.value,
);
const selectTextColor = computed(() => (isDark.value ? '#76e2b6' : undefined));
const dragOverBg = computed(() =>
  isDark.value ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
);
const dragOverBorder = computed(() => (isDark.value ? '#4ade80' : '#22c55e'));

const props = defineProps<{
  groupNames: string[];
  displayData: Record<string, { jp: string; zh: string }[]>;
  selectedGroup: string | undefined;
  editingGroupName: string | null;
  editingGroupNewName: string;
  showNewGroupInput: boolean;
  newGroupName: string;
  ungroupedCount: number;
  isAdmin: boolean;
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
  dropTerm: [jp: string, groupName: string | undefined];
  deleteGroupRequest: [name: string];
  reorderGroups: [from: string, to: string];
  syncRemoteToLocal: [];
  syncLocalToEditing: [];
  clearRequest: [];
}>();

const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

function startLongPress(name: string) {
  longPressTimer.value = setTimeout(() => {
    emit('deleteGroupRequest', name);
  }, 600);
}

function cancelLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function onTabWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement;
  el.scrollLeft += e.deltaY;
  e.preventDefault();
}

const dragOverGroup = ref<string | undefined>(undefined);
const draggedGroup = ref<string | null>(null);

function onDragStart(e: DragEvent, name: string) {
  draggedGroup.value = name;
  e.dataTransfer!.setData('text/plain', name);
  e.dataTransfer!.effectAllowed = 'move';
}

function onDragEnd() {
  draggedGroup.value = null;
}

function onTabsDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement;
  const related = e.relatedTarget as HTMLElement | null;
  if (!related || !el.contains(related)) {
    dragOverGroup.value = undefined;
  }
}

function onDrop(e: DragEvent, groupName: string | undefined) {
  e.preventDefault();
  if (draggedGroup.value && draggedGroup.value !== groupName) {
    emit('reorderGroups', draggedGroup.value, groupName ?? '');
    draggedGroup.value = null;
    dragOverGroup.value = undefined;
    return;
  }
  draggedGroup.value = null;
  const jp = e.dataTransfer?.getData('text/plain');
  if (jp) emit('dropTerm', jp, groupName);
  dragOverGroup.value = undefined;
}
</script>

<template>
  <div
    style="
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;
      -ms-overflow-style: none;
    "
    class="hide-scrollbar"
    @wheel="onTabWheel"
  >
    <div
      style="display: flex; align-items: center; flex-wrap: nowrap; gap: 4px"
      @dragleave="onTabsDragLeave"
    >
      <!-- 用户分组列表 -->
      <div
        v-for="name in groupNames"
        :key="name"
        draggable="true"
        @click="emit('select', name)"
        @dragstart="(e: DragEvent) => onDragStart(e, name)"
        @dragend="onDragEnd"
        @dragover.prevent="dragOverGroup = name"
        @drop="(e: DragEvent) => onDrop(e, name)"
        @contextmenu.prevent="emit('deleteGroupRequest', name)"
        @touchstart="startLongPress(name)"
        @touchend="cancelLongPress"
        @touchmove="cancelLongPress"
        :style="{
          padding: '4px 8px',
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          background:
            selectedGroup === name
              ? selectBg
              : dragOverGroup === name
                ? dragOverBg
                : 'var(--n-action-color, rgba(0,0,0,0.03))',
          borderLeft:
            selectedGroup === name
              ? `3px solid ${selectBorder}`
              : dragOverGroup === name
                ? `1px dashed ${dragOverBorder}`
                : '3px solid transparent',
          color: selectedGroup === name ? selectTextColor : undefined,
          borderRight:
            dragOverGroup === name ? `1px dashed ${dragOverBorder}` : 'none',
          borderTop:
            dragOverGroup === name ? `1px dashed ${dragOverBorder}` : 'none',
          borderBottom:
            dragOverGroup === name ? `1px dashed ${dragOverBorder}` : 'none',
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
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: nowrap;
              gap: 6px;
            "
          >
            <n-text @dblclick="emit('startRename', name)" style="flex: 1">
              {{ name }}
            </n-text>
            <n-text depth="3" style="font-size: 10px">
              {{ displayData[name]?.length ?? 0 }}
            </n-text>
          </div>
        </template>
      </div>

      <!-- 未分组 -->
      <div
        @click="emit('select', undefined)"
        @dragover.prevent="dragOverGroup = '未分组'"
        @drop="(e: DragEvent) => onDrop(e, undefined)"
        :style="{
          padding: '4px 8px',
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          background:
            selectedGroup === undefined
              ? selectBg
              : dragOverGroup === '未分组'
                ? dragOverBg
                : 'var(--n-action-color, rgba(0,0,0,0.03))',
          borderLeft:
            selectedGroup === undefined
              ? `3px solid ${selectBorder}`
              : dragOverGroup === '未分组'
                ? `1px dashed ${dragOverBorder}`
                : '3px solid transparent',
          color: selectedGroup === undefined ? selectTextColor : undefined,
          borderRight:
            dragOverGroup === '未分组'
              ? `1px dashed ${dragOverBorder}`
              : 'none',
          borderTop:
            dragOverGroup === '未分组'
              ? `1px dashed ${dragOverBorder}`
              : 'none',
          borderBottom:
            dragOverGroup === '未分组'
              ? `1px dashed ${dragOverBorder}`
              : 'none',
        }"
      >
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: nowrap;
            gap: 6px;
          "
        >
          <n-text>未分组</n-text>
          <n-text depth="3" style="font-size: 10px">
            {{ ungroupedCount }}
          </n-text>
        </div>
      </div>
      <!-- 新建组 -->
      <div v-if="showNewGroupInput" style="flex-shrink: 0">
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
        style="flex-shrink: 0"
        @action="emit('showNewGroup')"
      />

      <!-- 删除当前组 -->
      <c-button
        v-if="selectedGroup && selectedGroup !== '未分组'"
        class="danger-hover-green"
        label="删除此组"
        size="tiny"
        text
        type="error"
        style="flex-shrink: 0; margin-left: 8px"
        @action="emit('deleteGroup')"
      />

      <!-- 单向同步 + 清空 -->
      <c-button
        label="远程→本地"
        size="tiny"
        text
        style="flex-shrink: 0"
        @action="emit('syncRemoteToLocal')"
      />
      <c-button
        label="本地→编辑区"
        size="tiny"
        text
        style="flex-shrink: 0"
        @action="emit('syncLocalToEditing')"
      />
      <c-button
        v-if="isAdmin"
        class="danger-hover-green"
        label="清空"
        size="tiny"
        text
        type="error"
        style="flex-shrink: 0"
        @action="emit('clearRequest')"
      />
    </div>
  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
:deep(.danger-hover-green:hover) {
  --n-text-color: #18a058 !important;
  --n-text-color-hover: #18a058 !important;
  --n-text-color-pressed: #18a058 !important;
  --n-text-color-focus: #18a058 !important;
}
</style>
