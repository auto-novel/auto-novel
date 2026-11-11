<script setup lang="ts">
defineProps<{
  wenku?: boolean;
}>();
</script>

<template>
  <div role="status">
    <span class="sr-only">正在加载小说详情…</span>
    <div aria-hidden="true" class="min-w-0" :class="{ 'pt-[18px]': !wenku }">
      <div v-if="wenku" class="flex gap-3 py-5">
        <USkeleton class="h-56 w-40 shrink-0" />
        <div class="min-w-0 flex-1 space-y-4 pt-2">
          <USkeleton class="h-7 w-5/6 bg-border" />
          <USkeleton v-for="index in 3" :key="index" class="h-6 w-3/4" />
        </div>
      </div>
      <template v-else>
        <USkeleton class="h-7 w-4/5 bg-border" />
        <USkeleton class="mt-3 h-6 w-2/3" />
        <USkeleton class="mt-4 h-5 w-2/5" />
      </template>
      <div class="mt-4 flex gap-3">
        <USkeleton v-for="index in 3" :key="index" class="h-8 w-20" />
      </div>
      <div class="my-6 space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-4" />
        <USkeleton class="h-4 w-2/3" />
      </div>
      <div class="flex gap-2">
        <USkeleton v-for="index in 4" :key="index" class="h-5 w-14" />
      </div>
      <div v-if="wenku" class="mt-4 flex gap-1 overflow-hidden">
        <USkeleton v-for="index in 5" :key="index" class="h-36 w-26 shrink-0" />
      </div>
      <div class="mt-6 border-t border-divider pt-5">
        <USkeleton class="mb-5 h-6 w-32 bg-border" />
        <USkeleton v-for="index in 4" :key="index" class="mb-4 h-5 w-4/5" />
      </div>
    </div>
  </div>
</template>
