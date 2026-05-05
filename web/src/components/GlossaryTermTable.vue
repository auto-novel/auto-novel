<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';
import type { GlossaryEntry } from '@/model/GlossaryGroup';

const props = defineProps<{
  entries: GlossaryEntry[];
  glossary: Record<string, string>;
  selectedTerms: Set<string>;
  isInServerGlossary: (jp: string) => boolean;
  isZhConflict: (jp: string) => boolean;
  getLocalZh: (jp: string) => string | undefined;
  novelId: string;
  inGroup: boolean;
  groupName?: string;
}>();

const emit = defineEmits<{
  toggleSelect: [jp: string, event: MouseEvent];
  deleteTerm: [jp: string];
  removeFromGroup: [jp: string];
  revertTerm: [jp: string];
  revertToLocalZh: [jp: string];
  clearLocalRecord: [jp: string];
  reorderTerm: [fromIndex: number, toIndex: number];
}>();

const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function onRowDragStart(e: DragEvent, entry: GlossaryEntry, index: number) {
  dragFromIndex.value = index;
  e.dataTransfer!.setData('text/plain', entry.jp);
  e.dataTransfer!.effectAllowed = 'move';
  (e.target as HTMLElement).style.opacity = '0.5';
}

function onRowDragEnd(e: DragEvent) {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
  (e.target as HTMLElement).style.opacity = '';
}

function onRowDragOver(e: DragEvent, index: number) {
  if (dragFromIndex.value === null) return;
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  dragOverIndex.value = e.clientY < midY ? index : index + 1;
}

function onRowDrop(e: DragEvent) {
  e.preventDefault();
  const from = dragFromIndex.value;
  const to = dragOverIndex.value;
  dragFromIndex.value = null;
  dragOverIndex.value = null;
  if (from === null || to === null || from === to) return;
  emit('reorderTerm', from, to);
}
</script>

<template>
  <table class="term-table">
    <TransitionGroup name="term-row" tag="tbody">
      <tr
        v-for="(entry, index) in entries"
        :key="entry.jp"
        draggable="true"
        :style="{
          background: selectedTerms.has(entry.jp)
            ? 'var(--primary-color-suppl, #d0e0ff)'
            : undefined,
          borderTop:
            dragOverIndex === index && dragFromIndex !== index
              ? '2px solid var(--primary-color, #18a058)'
              : undefined,
        }"
        @click="emit('toggleSelect', entry.jp, $event)"
        @dragstart="(e: DragEvent) => onRowDragStart(e, entry, index)"
        @dragend="(e: DragEvent) => onRowDragEnd(e)"
        @dragover="(e: DragEvent) => onRowDragOver(e, index)"
        @drop="(e: DragEvent) => onRowDrop(e)"
      >
        <!-- 删除按钮 -->
        <td style="width: 32px">
          <span style="position: relative; top: 2px">
            <c-button
              v-if="isInServerGlossary(entry.jp)"
              :icon="DeleteOutlineOutlined"
              text
              type="error"
              size="small"
              @action="emit('deleteTerm', entry.jp)"
            />
          </span>
        </td>

        <!-- 拖拽把手 -->
        <td
          style="
            width: 20px;
            cursor: grab;
            color: var(--n-text-color-disabled, #999);
            font-size: 10px;
            padding: 0 2px;
          "
        >
          <span style="position: relative; top: -2px">:::</span>
        </td>

        <!-- jp -->
        <td>
          <n-text
            :depth="isInServerGlossary(entry.jp) ? undefined : 3"
            :style="
              isInServerGlossary(entry.jp)
                ? {}
                : { textDecoration: 'line-through' }
            "
          >
            {{ entry.jp }}
          </n-text>
        </td>

        <td nowrap="nowrap">=></td>

        <!-- zh -->
        <td style="padding-right: 8px">
          <template v-if="isInServerGlossary(entry.jp)">
            <n-input
              v-model:value="glossary[entry.jp]"
              size="tiny"
              placeholder="请输入中文翻译"
              :theme-overrides="{ border: '0', color: 'transprent' }"
            />
          </template>
          <n-text v-else depth="3" style="text-decoration: line-through">
            {{ entry.zh }}
          </n-text>
        </td>

        <!-- 操作按钮 -->
        <td style="white-space: nowrap">
          <!-- 不在服务端 → 回退按钮 -->
          <c-button
            v-if="!isInServerGlossary(entry.jp) && novelId"
            label="回退"
            size="tiny"
            text
            type="info"
            @action="emit('revertTerm', entry.jp)"
          />

          <!-- 在分组中 → 移出按钮 -->
          <c-button
            v-if="isInServerGlossary(entry.jp) && inGroup"
            label="移出"
            size="tiny"
            text
            @action="emit('removeFromGroup', entry.jp)"
          />

          <!-- zh 冲突提示 -->
          <template
            v-if="isInServerGlossary(entry.jp) && isZhConflict(entry.jp)"
          >
            <n-text depth="3" style="font-size: 10px; margin-left: 4px">
              本地：{{ getLocalZh(entry.jp) }}
            </n-text>
            <c-button
              label="回退到本地"
              size="tiny"
              text
              @action="emit('revertToLocalZh', entry.jp)"
            />
            <c-button
              label="清除本地"
              size="tiny"
              text
              type="error"
              @action="emit('clearLocalRecord', entry.jp)"
            />
          </template>
        </td>
      </tr>
    </TransitionGroup>
  </table>
</template>

<style scoped>
.term-table {
  width: 100%;
  max-width: 500px;
  border-collapse: collapse;
  font-size: 12px;
}

.term-table td {
  padding: 6px 12px;
}

.term-table tr {
  border-bottom: 1px solid var(--n-border-color, #efeff5);
}

.term-table tbody tr:nth-child(even) {
  background: var(--n-td-striped-color, rgba(0, 0, 0, 0.04));
}

.term-row-move {
  transition: transform 0.25s ease;
}

.term-row-enter-active,
.term-row-leave-active {
  transition: all 0.25s ease;
}

.term-row-enter-from,
.term-row-leave-to {
  opacity: 0;
}
</style>
