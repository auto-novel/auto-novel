<script setup lang="ts">
defineProps<{
  label: string;
  icon: Component;
}>();

defineEmits<{
  action: [];
}>();
</script>

<template>
  <n-button
    quaternary
    size="small"
    :title="label"
    @mousedown="
      (e: any) => {
        $emit('action');
        e.preventDefault();
      }
    "
    style="padding-left: 8px; padding-right: 8px"
  >
    <template #icon>
      <n-icon :component="icon" />
    </template>
  </n-button>
</template>
