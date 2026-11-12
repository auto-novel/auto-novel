<script lang="ts" setup>
defineProps<{
  icon: Component;
  text: string;
}>();
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    :tabindex="-1"
    class="h-16 justify-center text-center"
  >
    <div>
      <component
        :is="icon"
        class="mb-1 inline-block size-6 shrink-0"
        aria-hidden="true"
      />
      <br />
      {{ text }}
    </div>
  </UButton>
</template>
