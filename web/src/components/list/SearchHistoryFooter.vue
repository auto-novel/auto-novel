<script setup lang="ts">
defineProps<{
  tags: string[];
}>();
const emits = defineEmits<{
  select: [string];
}>();
</script>

<template>
  <div class="flex w-full flex-wrap items-center gap-1 px-3 py-2">
    <UButton
      v-for="tag in tags"
      :key="tag"
      type="button"
      :color="tag.startsWith('-') ? 'error' : 'success'"
      variant="subtle"
      size="xs"
      @mousedown.prevent
      @click="emits('select', tag)"
    >
      {{ tag }}
    </UButton>
  </div>
</template>
