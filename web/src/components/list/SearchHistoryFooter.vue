<script setup lang="ts">
defineProps<{
  tags: string[];
}>();
const emits = defineEmits<{
  select: [string];
}>();
</script>

<template>
  <div class="flex w-full flex-wrap items-center justify-start gap-1 px-3 py-2">
    <n-tag
      v-for="tag in tags"
      :key="tag"
      :type="tag.startsWith('-') ? 'error' : 'success'"
      size="small"
      style="cursor: pointer"
      @click="emits('select', tag)"
    >
      {{ tag }}
    </n-tag>
  </div>
</template>
