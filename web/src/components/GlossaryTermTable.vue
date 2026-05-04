<script lang="ts" setup>
import { DeleteOutlineOutlined } from '@vicons/material';
import type { GlossaryEntry } from '@/model/GlossaryGroup';

defineProps<{
  entries: GlossaryEntry[];
  glossary: Record<string, string>;
  selectedTerms: Set<string>;
  isInServerGlossary: (jp: string) => boolean;
  isZhConflict: (jp: string) => boolean;
  getLocalZh: (jp: string) => string | undefined;
  novelId: string;
  inGroup: boolean;
}>();

const emit = defineEmits<{
  toggleSelect: [jp: string, event: MouseEvent];
  deleteTerm: [jp: string];
  removeFromGroup: [jp: string];
  revertTerm: [jp: string];
  revertToLocalZh: [jp: string];
  clearLocalRecord: [jp: string];
}>();
</script>

<template>
  <n-table striped size="small" style="font-size: 12px; max-width: 500px">
    <tr
      v-for="entry in entries"
      :key="entry.jp"
      draggable="true"
      :style="{
        background: selectedTerms.has(entry.jp)
          ? 'var(--primary-color-suppl, #d0e0ff)'
          : undefined,
      }"
      @click="emit('toggleSelect', entry.jp, $event)"
      @dragstart="
        (e: DragEvent) => {
          e.dataTransfer!.setData('text/plain', entry.jp);
          (e.target as HTMLElement).style.opacity = '0.5';
        }
      "
      @dragend="
        (e: DragEvent) => {
          (e.target as HTMLElement).style.opacity = '';
        }
      "
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
        <template v-if="isInServerGlossary(entry.jp) && isZhConflict(entry.jp)">
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
  </n-table>
</template>
