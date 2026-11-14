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
  { label: '有道', value: 'youdao' },
  { label: 'GPT', value: 'gpt' },
  { label: 'Sakura', value: 'sakura' },
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
  <UFieldGroup>
    <UButton
      v-for="option in translationOptions"
      :key="option.value"
      :tabindex="-1"
      variant="outline"
      :color="value.includes(option.value) ? 'primary' : 'neutral'"
      :aria-pressed="value.includes(option.value)"
      :value="option.value"
      @click="toggleTranslator(option.value)"
      :class="{ 'h-12': twoLine }"
    >
      <span>
        {{ option.label }}
        <template v-if="showOrder === true">
          <br v-if="twoLine" />
          {{ calculateTranslatorOrderLabel(option.value) }}
        </template>
      </span>
    </UButton>
  </UFieldGroup>
</template>
