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
    <button
      v-for="tag in tags"
      :key="tag"
      type="button"
      class="cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      @mousedown.prevent
      @click="emits('select', tag)"
    >
      <n-tag :type="tag.startsWith('-') ? 'error' : 'success'" size="small">
        {{ tag }}
      </n-tag>
    </button>
  </div>
</template>
