<script lang="ts" setup>
defineProps<{
  checked: boolean;
  label: string;
  type?: 'info' | 'warning' | 'error';
}>();

const emit = defineEmits<{
  'update:checked': [boolean];
}>();
</script>

<template>
  <n-tag
    role="button"
    :type="checked ? type ?? 'success' : 'default'"
    @click="emit('update:checked', !checked)"
    style="border-radius: 0px; cursor: pointer"
    size="small"
  >
    {{ label }}
  </n-tag>
</template>
