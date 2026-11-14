<script setup lang="ts">
import { XMarkdownEditor } from '@novelia/web-kit';
import { useEventListener } from '@vueuse/core';

import { markdown } from './markdown';

defineOptions({ inheritAttrs: false });
withDefaults(
  defineProps<{
    rows?: number;
    maxlength?: number;
  }>(),
  { rows: 8, maxlength: undefined },
);
const value = defineModel<string>('value', { required: true });

useEventListener(window, 'beforeunload', (event) => {
  if (value.value.trim()) {
    event.preventDefault();
    event.returnValue = '有未保存的编辑，确定要离开吗？';
  }
});
</script>

<template>
  <div>
    <XMarkdownEditor
      v-bind="$attrs"
      v-model="value"
      :rows="rows"
      :maxlength="maxlength"
      :spellcheck="false"
      :markdown="markdown"
      :tools="[
        'bold',
        'italic',
        'strike',
        'link',
        'spoiler',
        'star',
        'details',
      ]"
    />
    <div class="mt-1 text-right text-xs text-muted">
      {{ value.length }}
      <template v-if="maxlength !== undefined">/ {{ maxlength }}</template>
    </div>
  </div>
</template>
