<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  action: (event: MouseEvent) => unknown;
  loading?: boolean;
  disabled?: boolean;
}>();

const running = ref(false);
const execute = async (event: MouseEvent) => {
  if (running.value || props.loading || props.disabled) return;
  // Lock before invoking the action, including synchronous throws and thenables.
  running.value = true;
  try {
    return await props.action(event);
  } finally {
    // Errors belong to the caller / Vue error handler, not a second generic toast.
    running.value = false;
  }
};
</script>

<template>
  <UButton
    color="neutral"
    variant="outline"
    class="group rounded-full"
    v-bind="$attrs"
    :loading="running || loading"
    :aria-busy="running || loading"
    :disabled="disabled"
    @click="execute"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </UButton>
</template>
