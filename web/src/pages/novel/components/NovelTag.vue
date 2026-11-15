<script lang="ts" setup>
defineProps<{
  tag: string;
  strong?: boolean;
  type?: 'default' | 'success' | 'info' | 'warning' | 'error';
}>();
</script>

<template>
  <UBadge
    :color="type && type !== 'default' ? type : 'neutral'"
    variant="soft"
    size="md"
    class="cursor-pointer font-normal"
  >
    <template v-if="strong === true">
      <b>{{ tag }}</b>
    </template>
    <template v-else>
      {{ tag }}
    </template>
  </UBadge>
</template>
