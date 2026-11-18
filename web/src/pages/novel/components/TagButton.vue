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
  <UButton
    type="button"
    :color="checked ? (type ?? 'success') : 'neutral'"
    variant="subtle"
    :aria-pressed="checked"
    @click="emit('update:checked', !checked)"
    size="xs"
  >
    {{ label }}
  </UButton>
</template>
