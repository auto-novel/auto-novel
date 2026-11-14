<script lang="ts" setup>
import { SearchOutlined } from '@vicons/material';

const value = defineModel<{
  query: string;
  enableRegexMode: boolean;
}>('value', {
  required: true,
});

const attrs = useAttrs();
</script>
<template>
  <UInput
    size="sm"
    v-model="value.query"
    class="w-full min-w-0 max-w-100"
    :ui="{ base: value.query ? 'pe-16' : '', trailing: 'gap-1' }"
    v-bind="attrs"
  >
    <template #trailing>
      <UButton
        v-if="value.query"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        icon="i-lucide-x"
        aria-label="清空搜索"
        @mousedown.prevent
        @click="value.query = ''"
      />
      <SearchOutlined class="size-4 shrink-0" aria-hidden="true" />
    </template>
  </UInput>

  <tag-button label="正则" v-model:checked="value.enableRegexMode" />
</template>
