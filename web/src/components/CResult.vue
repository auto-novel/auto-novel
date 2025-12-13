<script setup lang="ts" generic="T extends any">
import type { Result } from '@/util/result';

defineProps<{
  result?: Result<T>;
  showEmpty?: (value: T) => boolean;
}>();
</script>

<template>
  <n-spin
    v-if="!result"
    size="large"
    style="
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 36px 0;
    "
  />
  <template v-if="result?.ok">
    <n-empty v-if="showEmpty && showEmpty(result.value)" description="空列表" />
    <slot v-else :value="result.value" />
  </template>

  <n-result
    v-else-if="result && !result.ok"
    status="error"
    title="加载错误"
    :description="result.error.message"
  />
</template>
