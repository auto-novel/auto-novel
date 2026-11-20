<script setup lang="ts">
import { computed, ref, watch } from 'vue';

defineProps<{
  label: string;
}>();
const color = defineModel<string>({ required: true });
const input = ref(color.value);
const validInput = computed(() => /^#[\da-f]{6}$/i.test(input.value));

watch(color, (value) => (input.value = value));

const updateColor = (value: string | undefined) => {
  // 阅读器背景亮度和下划线透明度计算都依赖不含 alpha 的六位 HEX。
  if (value && /^#[\da-f]{6}$/i.test(value)) {
    color.value = value.toUpperCase();
    input.value = color.value;
  }
};
const commitInput = () => updateColor(input.value.trim());
</script>

<template>
  <UPopover>
    <UButton
      color="neutral"
      variant="outline"
      :aria-label="`${label}：${color}`"
    >
      <span
        aria-hidden="true"
        class="size-4 shrink-0 rounded border border-default"
        :style="{ backgroundColor: color }"
      />
      {{ label }}：{{ color }}
    </UButton>
    <template #content>
      <div class="flex flex-col gap-3 p-3">
        <UColorPicker
          :model-value="color"
          format="hex"
          :aria-label="`${label}颜色`"
          @update:model-value="updateColor"
        />
        <UFormField
          :label="`${label} HEX`"
          :error="validInput ? undefined : '请输入 #RRGGBB 格式的颜色'"
        >
          <UInput
            v-model="input"
            class="w-full"
            :aria-label="`${label} HEX`"
            placeholder="#RRGGBB"
            :spellcheck="false"
            autocomplete="off"
            @change="commitInput"
            @keydown.enter.prevent="commitInput"
          />
        </UFormField>
      </div>
    </template>
  </UPopover>
</template>
