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
  historyCount: number;
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
  sortByTime: [];
  sortByTimeReverse: [];
  sortByKana: [];
  sortByKanaReverse: [];
  showHistory: [];
}>();

const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const touchDrag = ref<{
  active: boolean;
  groupName: string | null;
  startX: number;
  startY: number;
  isDragging: boolean;
}>({ active: false, groupName: null, startX: 0, startY: 0, isDragging: false });

function findGroupFromTouch(touch: Touch): string | undefined {
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!el) return undefined;
  const tab = (el as HTMLElement).closest('[data-group-name]');
  return (tab as HTMLElement | null)?.dataset.groupName;
}

function onTouchStart(e: TouchEvent, name: string) {
  longPressTimer.value = setTimeout(() => {
    emit('deleteGroupRequest', name);
    touchDrag.value = {
      active: false,
      groupName: null,
      startX: 0,
      startY: 0,
      isDragging: false,
    };
  }, 600);
  const touch = e.touches[0];
  touchDrag.value = {
    active: true,
    groupName: name,
    startX: touch.clientX,
    startY: touch.clientY,
    isDragging: false,
  };
}

function onTouchMove(e: TouchEvent) {
  cancelLongPress();
  if (!touchDrag.value.active) return;
  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - touchDrag.value.startX);
  const dy = Math.abs(touch.clientY - touchDrag.value.startY);
  if (!touchDrag.value.isDragging && (dx > 10 || dy > 10)) {
    touchDrag.value.isDragging = true;
  }
  if (touchDrag.value.isDragging) {
    e.preventDefault();
    dragOverGroup.value = findGroupFromTouch(touch);
  }
}

function onTouchEnd(e: TouchEvent) {
  cancelLongPress();
  if (!touchDrag.value.active) return;
  if (touchDrag.value.isDragging) {
    const touch = e.changedTouches[0];
    let targetGroup = findGroupFromTouch(touch) ?? dragOverGroup.value;
    if (targetGroup === '未分组') targetGroup = undefined;
    if (targetGroup) {
      targetGroup = resolveDropTarget(
        touch.clientX,
        touch.clientY,
        targetGroup,
      );
    }
    if (
      touchDrag.value.groupName &&
      targetGroup !== undefined &&
      targetGroup !== touchDrag.value.groupName
    ) {
      emit('reorderGroups', touchDrag.value.groupName, targetGroup);
    }
    dragOverGroup.value = undefined;
  }
  touchDrag.value = {
    active: false,
    groupName: null,
    startX: 0,
    startY: 0,
    isDragging: false,
  };
}

function cancelLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

const sortOptions = [
  { label: '时间排序', key: 'time' },
  { label: '时间倒序', key: 'time-reverse' },
  { label: '五十音排序 (A→Z)', key: 'kana' },
  { label: '五十音倒序 (Z→A)', key: 'kana-reverse' },
];

function handleSortSelect(key: string) {
  if (key === 'time') emit('sortByTime');
  else if (key === 'time-reverse') emit('sortByTimeReverse');
  else if (key === 'kana') emit('sortByKana');
  else if (key === 'kana-reverse') emit('sortByKanaReverse');
}

function resolveDropTarget(
  clientX: number,
  clientY: number,
  currentTarget: string,
): string {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return currentTarget;
  const tab = (el as HTMLElement).closest(
    '[data-group-name]',
  ) as HTMLElement | null;
  if (!tab || tab.dataset.groupName !== currentTarget) return currentTarget;
  const rect = tab.getBoundingClientRect();
  if (clientX <= rect.left + rect.width / 2) return currentTarget;
  const idx = props.groupNames.indexOf(currentTarget);
  if (idx >= 0 && idx < props.groupNames.length - 1) {
    return props.groupNames[idx + 1];
  }
  return '';
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

function isDragTarget(name: string): boolean {
  if (dragOverGroup.value !== name) return false;
  if (draggedGroup.value === name) return false;
  if (touchDrag.value.groupName === name) return false;
  return true;
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
  const raw = e.dataTransfer?.getData('text/plain');
  if (raw) {
    emit('dropTerm', raw, groupName);
  } else if (draggedGroup.value && draggedGroup.value !== groupName) {
    let target = groupName ?? '';
    if (target) {
      target = resolveDropTarget(e.clientX, e.clientY, target);
    }
    emit('reorderGroups', draggedGroup.value, target);
  }
  draggedGroup.value = null;
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
      @dragover.prevent
      @drop="
        (e: DragEvent) => {
          e.preventDefault();
          onDrop(e, dragOverGroup === '未分组' ? undefined : dragOverGroup);
        }
      "
    >
      <!-- 用户分组列表 -->
      <TransitionGroup
        name="group-tab"
        tag="div"
        style="display: flex; gap: 4px"
      >
        <div
          v-for="name in groupNames"
          :key="name"
          :data-group-name="name"
          draggable="true"
          @click="emit('select', name)"
          @dragstart="(e: DragEvent) => onDragStart(e, name)"
          @dragend="onDragEnd"
          @dragover.prevent="dragOverGroup = name"
          @drop="
            (e: DragEvent) => {
              e.stopPropagation();
              onDrop(e, name);
            }
          "
          @contextmenu.prevent="emit('deleteGroupRequest', name)"
          @touchstart="(e: TouchEvent) => onTouchStart(e, name)"
          @touchmove="(e: TouchEvent) => onTouchMove(e)"
          @touchend="(e: TouchEvent) => onTouchEnd(e)"
          :style="{
            padding: '4px 8px',
            cursor: 'grab',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            userSelect: 'none',
            touchAction: 'none',
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
            marginLeft: isDragTarget(name) ? '36px' : '0px',
            transition: 'margin-left 0.2s ease, transform 0.25s ease',
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
      </TransitionGroup>

      <!-- 未分组 -->
      <div
        @click="emit('select', undefined)"
        @dragover.prevent="dragOverGroup = '未分组'"
        @drop="
          (e: DragEvent) => {
            e.stopPropagation();
            onDrop(e, undefined);
          }
        "
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
          marginLeft: dragOverGroup === '未分组' ? '36px' : '0px',
          transition: 'margin-left 0.2s ease, transform 0.25s ease',
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

      <!-- 排序 -->
      <n-dropdown
        trigger="click"
        :options="sortOptions"
        @select="handleSortSelect"
      >
        <c-button label="排序" size="tiny" text style="flex-shrink: 0" />
      </n-dropdown>

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
      <n-button
        size="tiny"
        text
        style="flex-shrink: 0; font-size: 12px"
        @click="emit('showHistory')"
      >
        历史
        <span v-if="historyCount > 0">[{{ historyCount }}]</span>
      </n-button>
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
.group-tab-move,
.group-tab-enter-active,
.group-tab-leave-active {
  transition: transform 0.25s ease;
}
.group-tab-enter-from,
.group-tab-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.group-tab-leave-active {
  position: absolute;
}
:deep(.danger-hover-green:hover) {
  --n-text-color: #18a058 !important;
  --n-text-color-hover: #18a058 !important;
  --n-text-color-pressed: #18a058 !important;
  --n-text-color-focus: #18a058 !important;
}
</style>
