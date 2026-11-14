<script lang="ts" setup>
defineProps<{
  tag: string;
  strong?: boolean;
}>();
</script>

<template>
  <n-tag :bordered="false" size="small" class="cursor-pointer!">
    <template v-if="strong === true">
      <b>{{ tag }}</b>
    </template>
    <template v-else>
      {{ tag }}
    </template>
  </n-tag>
</template>
