<script setup lang="ts">
import {
  KeyboardArrowDownRound,
  KeyboardArrowUpRound,
  SortOutlined,
} from '@vicons/material';

defineProps<{
  hasSections: boolean;
  isAnyExpanded: boolean;
}>();
const reverse = defineModel<boolean>('reverse', { required: true });
defineEmits<{ toggleAll: [] }>();
</script>

<template>
  <div class="flex shrink-0 items-center gap-2">
    <UButton
      v-if="hasSections"
      :icon="isAnyExpanded ? KeyboardArrowUpRound : KeyboardArrowDownRound"
      color="neutral"
      size="sm"
      variant="ghost"
      class="text-sm/4"
      @click="$emit('toggleAll')"
    >
      {{ isAnyExpanded ? '折叠' : '展开' }}
    </UButton>
    <UButton
      :icon="SortOutlined"
      color="neutral"
      size="sm"
      variant="ghost"
      class="text-sm/4"
      @click="reverse = !reverse"
    >
      {{ reverse ? '倒序' : '正序' }}
    </UButton>
  </div>
</template>
