<script lang="ts" setup>
import type { TranslatorId } from '@/model/Translator';

const props = defineProps<{
  value: TranslatorId[];
  showOrder?: boolean;
  twoLine?: boolean;
  variant?: 'list' | 'table';
}>();
const emit = defineEmits<{
  'update:value': [TranslatorId[]];
}>();

const translationOptions: { label: string; value: TranslatorId }[] = [
  { label: '有道', value: 'youdao' },
  { label: 'GPT', value: 'gpt' },
  { label: 'Sakura', value: 'sakura' },
];

const updateValue = (value: TranslatorId[]) => {
  emit('update:value', value);
};

const calculateTranslatorOrderLabel = (id: TranslatorId) => {
  const index = props.value.indexOf(id);
  if (index < 0) {
    return '[x]';
  } else {
    return `[${index + 1}]`;
  }
};
</script>

<template>
  <UCheckboxGroup
    :model-value="value"
    :items="translationOptions"
    orientation="horizontal"
    :variant="variant ?? 'table'"
    :indicator="variant === 'list' ? 'start' : 'hidden'"
    :ui="{
      fieldset: 'flex-wrap',
      // 双行保持自然高度，避免固定高度和垂直居中改变第一行的位置。
      item: variant === 'list' ? undefined : 'px-2 py-1',
    }"
    @update:model-value="updateValue"
  >
    <template #label="{ item }">
      {{ item.label }}
      <template v-if="showOrder">
        <br v-if="twoLine" />
        {{ calculateTranslatorOrderLabel(item.value) }}
      </template>
    </template>
  </UCheckboxGroup>
</template>
