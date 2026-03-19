<script lang="ts" setup>
import type { TranslatorId } from '@/model/Translator';

const props = defineProps<{
  value: TranslatorId[];
  showOrder?: boolean;
  twoLine?: boolean;
}>();
const emit = defineEmits<{
  'update:value': [TranslatorId[]];
}>();

const translationOptions: { label: string; value: TranslatorId }[] = [
  { label: '百度', value: 'baidu' },
  { label: '有道', value: 'youdao' },
  { label: 'GPT', value: 'gpt' },
  { label: 'Sakura', value: 'sakura' },
  { label: 'Murasaki', value: 'murasaki' },
];

const toggleTranslator = (id: TranslatorId) => {
  if (props.value.includes(id)) {
    emit(
      'update:value',
      props.value.filter((it) => it !== id),
    );
  } else {
    props.value.push(id);
  }
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
  <n-button-group>
    <n-button
      v-for="option in translationOptions"
      :key="option.value"
      :focusable="false"
      ghost
      :type="value.includes(option.value) ? 'primary' : 'default'"
      :value="option.value"
      @click="toggleTranslator(option.value)"
      :style="twoLine ? { height: '48px' } : {}"
    >
      {{ option.label }}
      <template v-if="showOrder === true">
        <br v-if="twoLine" />
        {{ calculateTranslatorOrderLabel(option.value) }}
      </template>
    </n-button>
  </n-button-group>
</template>
