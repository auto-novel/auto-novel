<script setup lang="ts">
import { Component } from 'vue';

defineProps<{
  label: string;
  icon: Component;
}>();

defineEmits<{
  action: [];
}>();
</script>

<template>
  <n-tooltip trigger="hover">
    <template #trigger>
      <n-button
        quaternary
        size="small"
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
    {{ label }}
  </n-tooltip>
</template>
