<script setup lang="ts">
import { SyncAltOutlined } from '@vicons/material';
import type { ListSelectOption } from './types';

const value = defineModel<number>('value', { required: true });

const props = defineProps<{
  label: string;
  option: ListSelectOption;
}>();

function isSelected(index: number) {
  if (props.option.multiple) {
    return (value.value & (1 << index)) != 0;
  } else {
    return value.value === index;
  }
}

function updateSelect(optionIndex: number) {
  value.value = props.option.multiple
    ? value.value ^ (1 << optionIndex)
    : optionIndex;
}

function invertSelection() {
  if (props.option.multiple) {
    value.value = value.value ^ (2 ** props.option.tags.length - 1);
  }
}
</script>

<template>
  <CActionWrapper :title="label" size="medium">
    <div class="flex flex-wrap justify-start gap-x-4 gap-y-1">
      <n-text
        v-for="(tag, index) in option.tags"
        :key="tag"
        text
        :type="isSelected(index) ? 'primary' : 'default'"
        @click="updateSelect(index)"
        style="cursor: pointer"
      >
        {{ tag }}
      </n-text>

      <UButton
        v-if="option.multiple"
        color="primary"
        @click="invertSelection()"
        variant="link"
        square
        class="rounded-full p-0"
        aria-label="反选"
      >
        <component
          :is="SyncAltOutlined"
          class="size-4.5 shrink-0"
          aria-hidden="true"
        />
      </UButton>
    </div>
  </CActionWrapper>
</template>
