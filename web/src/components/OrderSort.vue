<script lang="ts" setup>
import { ArrowDropUpFilled, ArrowDropDownFilled } from '@vicons/material';
interface Option {
  value: string;
  label: string;
}
const modelValue = defineModel<{
  value: string;
  desc: boolean;
}>('value', {
  required: true,
});

const props = withDefaults(
  defineProps<{
    options: Option[];
    defaultDesc?: boolean;
  }>(),
  {
    defaultDesc: true,
  },
);

let currentValue = modelValue.value.value;

const handelClick = (option: Option) => {
  let desc = false;
  if (currentValue != option.value) {
    // 当前切换了选项，重置desc
    currentValue = option.value;
    desc = props.defaultDesc;
  } else {
    desc = !modelValue.value.desc;
  }
  modelValue.value = {
    value: option.value,
    desc,
  };
};
</script>
<template>
  <UFieldGroup size="sm">
    <template v-for="option in options" :key="option.value">
      <UButton
        :color="option.value === modelValue.value ? 'success' : 'neutral'"
        :aria-pressed="option.value === modelValue.value"
        @click="handelClick(option)"
        variant="outline"
        class="text-sm/4"
      >
        <template #leading v-if="option.value === modelValue.value">
          <ArrowDropDownFilled
            v-if="modelValue.desc"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <ArrowDropUpFilled
            v-else
            class="size-4 shrink-0"
            aria-hidden="true"
          />
        </template>
        {{ option.label }}
      </UButton>
    </template>
  </UFieldGroup>
</template>
