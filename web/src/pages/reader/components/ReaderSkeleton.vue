<script setup lang="ts"></script>

<template>
  <div role="status" class="py-5">
    <span class="sr-only">正在加载章节正文…</span>
    <div aria-hidden="true">
      <USkeleton class="h-6 w-3/4" />
      <USkeleton class="mt-3 h-5 w-1/2" />
      <div class="my-6 border-t border-divider" />
      <div v-for="paragraph in 3" :key="paragraph" class="mb-8 space-y-4">
        <USkeleton class="ml-8 h-4" />
        <USkeleton class="h-4" />
        <USkeleton class="h-4 w-5/6" />
      </div>
    </div>
  </div>
</template>
