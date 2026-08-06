<script lang="ts" setup>
defineProps<{ title: string }>();
</script>

<template>
  <n-flex
    align="baseline"
    justify="space-between"
    style="width: 100%; row-gap: 2px"
  >
    <n-h2 prefix="bar" style="flex-shrink: 0">{{ title }}</n-h2>
    <n-flex style="flex-shrink: 0">
      <slot />
    </n-flex>
  </n-flex>
</template>
